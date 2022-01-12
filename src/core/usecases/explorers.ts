import "minimal-polyfills/Object.fromEntries";
import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { id } from "tsafe/id";
import type { ThunkAction, ThunksExtraArgument } from "../setup";
import type { SecretsManagerClient, Secret } from "core/ports/SecretsManagerClient";
import {
    join as pathJoin,
    dirname as pathDirname,
    relative as pathRelative,
    basename as pathBasename,
} from "path";
import type { ApiLogs } from "core/tools/apiLogger";
import { logApi } from "core/tools/apiLogger";
import { S3Client } from "../ports/S3Client";
import { getVaultApiLogger } from "../secondaryAdapters/vaultSecretsManagerClient";
import { s3ApiLogger } from "../secondaryAdapters/minioS3Client";
import { crawlFactory } from "core/tools/crawl";
import { assert } from "tsafe/assert";
import { selectors as projectSelectionSelectors } from "./projectSelection";
import { Evt } from "evt";
import type { Ctx } from "evt";
import type { RootState } from "../setup";
import memoize from "memoizee";
import type { WritableDraft } from "immer/dist/types/types-external";

export type ExplorersState = Record<
    "s3" | "secrets",
    {
        directoryPath: string | undefined;
        directoryItems: {
            kind: "file" | "directory";
            basename: string;
        }[];
        isNavigationOngoing: boolean;
        ongoingOperations: ({
            directoryPath: string;
            basename: string;
            kind: "file" | "directory";
            operation: "create" | "rename" | "delete";
        } & (
            | {
                  operation: "create" | "delete";
              }
            | {
                  operation: "rename";
                  previousBasename: string;
              }
        ))[];
        "~internal": {
            isUserWatching: boolean;
        };
    }
>;

export const { name, reducer, actions } = createSlice({
    "name": "explorers",
    "initialState": id<ExplorersState>(
        (() => {
            const contextualState = {
                "directoryPath": undefined,
                "directoryItems": [],
                "isNavigationOngoing": false,
                "ongoingOperations": [],
                "~internal": {
                    "isUserWatching": false,
                },
            };

            return {
                "s3": contextualState,
                "secrets": contextualState,
            };
        })(),
    ),
    "reducers": {
        "navigationStarted": (
            state,
            { payload }: PayloadAction<{ explorerType: "s3" | "secrets" }>,
        ) => {
            const { explorerType } = payload;

            const contextualState = state[explorerType];

            contextualState.isNavigationOngoing = true;
        },
        "navigationCompleted": (
            state,
            {
                payload,
            }: PayloadAction<{
                explorerType: "s3" | "secrets";
                directoryPath: string;
                directoryItems: {
                    kind: "file" | "directory";
                    basename: string;
                }[];
            }>,
        ) => {
            const { explorerType, directoryPath, directoryItems } = payload;

            const contextualState = state[explorerType];

            contextualState.directoryPath = directoryPath;
            contextualState.directoryItems = directoryItems;
            contextualState.isNavigationOngoing = false;

            //Properly restore state when navigating back to
            //a directory with ongoing operations.
            contextualState.ongoingOperations
                .filter(o => pathRelative(o.directoryPath, directoryPath) === "")
                .forEach(o => {
                    switch (o.operation) {
                        case "rename":
                            removeIfPresent(contextualState.directoryItems, {
                                "kind": o.kind,
                                "basename": o.previousBasename,
                            });
                            break;
                        case "delete":
                            removeIfPresent(contextualState.directoryItems, {
                                "kind": o.kind,
                                "basename": o.basename,
                            });
                            break;
                    }
                });
        },
        "navigationCanceled": (
            state,
            { payload }: PayloadAction<{ explorerType: "s3" | "secrets" }>,
        ) => {
            const { explorerType } = payload;

            state[explorerType].isNavigationOngoing = false;
        },
        "operationStarted": (
            state,
            {
                payload,
            }: PayloadAction<
                {
                    explorerType: "s3" | "secrets";
                    kind: "file" | "directory";
                    basename: string;
                } & (
                    | {
                          operation: "create" | "delete";
                      }
                    | {
                          operation: "rename";
                          newBasename: string;
                      }
                )
            >,
        ) => {
            const { explorerType, kind, basename } = payload;

            const contextualState = state[explorerType];

            assert(contextualState.directoryPath !== undefined);

            switch (payload.operation) {
                case "rename":
                case "delete":
                    removeIfPresent(contextualState.directoryItems, { kind, basename });
                    break;
            }

            contextualState.ongoingOperations.push({
                "directoryPath": contextualState.directoryPath,
                kind,
                ...(() => {
                    switch (payload.operation) {
                        case "rename":
                            return {
                                "operation": payload.operation,
                                "basename": payload.newBasename,
                                "previousBasename": basename,
                            };
                        case "delete":
                        case "create":
                            return {
                                "operation": payload.operation,
                                basename,
                            };
                    }
                })(),
            });
        },
        "operationCompleted": (
            state,
            {
                payload,
            }: PayloadAction<{
                explorerType: "s3" | "secrets";
                kind: "file" | "directory";
                basename: string;
                directoryPath: string;
            }>,
        ) => {
            const { explorerType, kind, basename, directoryPath } = payload;

            const contextualState = state[explorerType];

            assert(contextualState.directoryPath !== undefined);

            const { ongoingOperations } = contextualState;

            const ongoingOperation = ongoingOperations.find(
                o =>
                    o.kind === kind &&
                    o.basename === basename &&
                    pathRelative(o.directoryPath, directoryPath) === "",
            );

            assert(ongoingOperation !== undefined);

            ongoingOperations.splice(ongoingOperations.indexOf(ongoingOperation), 1);

            if (pathRelative(contextualState.directoryPath, directoryPath) !== "") {
                return;
            }

            switch (ongoingOperation.operation) {
                case "create":
                case "rename":
                    contextualState.directoryItems.push({
                        "basename": ongoingOperation.basename,
                        kind,
                    });
                    break;
            }
        },
        "isUserWatchingChanged": (
            state,
            {
                payload,
            }: PayloadAction<{ explorerType: "s3" | "secrets"; isUserWatching: boolean }>,
        ) => {
            const { explorerType, isUserWatching } = payload;

            state[explorerType]["~internal"].isUserWatching = isUserWatching;
        },
    },
});

export type ExplorersCreateParams =
    | ExplorersCreateParams.Directory
    | ExplorersCreateParams.File;

export declare namespace ExplorersCreateParams {
    export type _Common = {
        basename: string;
    };

    export type Directory = _Common & {
        createWhat: "directory";
        explorerType: "s3" | "secrets";
    };

    export type File = File.S3 | File.Secrets;

    export namespace File {
        type _FileCommon = _Common & {
            createWhat: "file";
        };

        export type S3 = _FileCommon & {
            explorerType: "s3";
            data: unknown;
        };

        export type Secrets = _FileCommon & {
            explorerType: "secrets";
        };
    }
}

const privateThunks = {
    "lazyInitialization":
        (params: { explorerType: "s3" | "secrets" }): ThunkAction<void> =>
        (...args) => {
            const { explorerType } = params;

            const [dispatch, getState, extraArg] = args;

            const { evtAction } = extraArg;

            Evt.merge([
                evtAction
                    .pipe(
                        event =>
                            event.sliceName === "projectSelection" &&
                            event.actionName === "projectChanged",
                    )
                    .attach(
                        () => getState().explorers[explorerType].isNavigationOngoing,
                        () => dispatch(actions.navigationCanceled({ explorerType })),
                    ),
                evtAction.pipe(
                    event =>
                        event.sliceName === "explorers" &&
                        event.actionName === "isUserWatchingChanged" &&
                        event.payload.explorerType === explorerType &&
                        (() => {
                            const { directoryPath, isNavigationOngoing } =
                                getState().explorers[explorerType];

                            return directoryPath === undefined && !isNavigationOngoing;
                        })(),
                ),
            ]).attach(
                () => getState().explorers[explorerType]["~internal"].isUserWatching,
                () =>
                    getSliceContexts(extraArg)[explorerType].onNavigate?.({
                        "path": (() => {
                            const project = projectSelectionSelectors.selectedProject(
                                getState(),
                            );

                            switch (explorerType) {
                                case "s3":
                                    return project.bucket;
                                case "secrets":
                                    return project.vaultTopDir;
                            }
                        })(),
                    }),
            );
        },
};

export const interUsecasesThunks = {
    "getLoggedSecretsApis":
        (): ThunkAction<
            Pick<SliceContexts["secrets"], "loggedApi" | "loggedExtendedApi" | "apiLogs">
        > =>
        (...args) => {
            const [, , extraArgs] = args;

            return getSliceContexts(extraArgs)["secrets"];
        },
    "waitForNoOngoingOperation":
        (params: {
            explorerType: "s3" | "secrets";
            kind: "file" | "directory";
            basename: string;
            directoryPath: string;
            ctx?: Ctx;
        }): ThunkAction =>
        async (...args) => {
            const [, getState, { evtAction }] = args;

            const {
                explorerType,
                kind,
                basename,
                directoryPath,
                ctx = Evt.newCtx(),
            } = params;

            const { ongoingOperations } = getState().explorers[explorerType];

            const ongoingOperation = ongoingOperations.find(
                o =>
                    o.kind === kind &&
                    o.basename === basename &&
                    o.directoryPath === directoryPath,
            );

            if (ongoingOperation === undefined) {
                return;
            }

            await evtAction.waitFor(
                event =>
                    event.sliceName === "explorers" &&
                    event.actionName === "operationCompleted" &&
                    event.payload.explorerType === explorerType &&
                    event.payload.kind === kind &&
                    (event.payload.basename === basename ||
                        (ongoingOperation.operation === "rename" &&
                            event.payload.basename ===
                                ongoingOperation.previousBasename)) &&
                    pathRelative(event.payload.directoryPath, directoryPath) === "",
                ctx,
            );
        },
};

export const thunks = {
    "notifyThatUserIsWatching":
        (params: {
            explorerType: "s3" | "secrets";
            onNavigate: (params: { path: string }) => void;
        }): ThunkAction<void> =>
        (...args) => {
            const { explorerType, onNavigate } = params;
            const [dispatch, , extraArg] = args;

            const sliceContext = getSliceContexts(extraArg)[explorerType];

            if (!sliceContext.isLazilyInitialized) {
                sliceContext.isLazilyInitialized = true;

                dispatch(privateThunks.lazyInitialization({ explorerType }));
            }

            sliceContext.onNavigate = onNavigate;

            dispatch(
                actions.isUserWatchingChanged({ explorerType, "isUserWatching": true }),
            );
        },
    "notifyThatUserIsNoLongerWatching":
        (params: { explorerType: "s3" | "secrets" }): ThunkAction<void> =>
        (...args) => {
            const { explorerType } = params;
            const [dispatch, , extraArg] = args;

            const sliceContext = getSliceContexts(extraArg);

            delete sliceContext[explorerType].onNavigate;

            dispatch(
                actions.isUserWatchingChanged({ explorerType, "isUserWatching": false }),
            );
        },
    /**
     * NOTE: It IS possible to navigate to a directory currently being renamed or created.
     */
    "navigate":
        (params: {
            explorerType: "s3" | "secrets";
            directoryPath: string;
        }): ThunkAction =>
        async (...args) => {
            const { explorerType, directoryPath } = params;

            const [dispatch, getState, extraArg] = args;

            dispatch(actions.navigationStarted({ explorerType }));

            const { loggedApi } = getSliceContexts(extraArg)[explorerType];

            if (getState().explorers[explorerType].isNavigationOngoing) {
                dispatch(actions.navigationCanceled({ explorerType }));
            }

            const ctx = Evt.newCtx();

            extraArg.evtAction.attach(
                event =>
                    event.sliceName === "explorers" &&
                    event.actionName === "navigationCanceled" &&
                    event.payload.explorerType === explorerType,
                ctx,
                () => ctx.done(),
            );

            await dispatch(
                interUsecasesThunks.waitForNoOngoingOperation({
                    explorerType,
                    "kind": "directory",
                    "directoryPath": pathJoin(directoryPath, ".."),
                    "basename": pathBasename(directoryPath),
                    ctx,
                }),
            );

            const { directories, files } = await Evt.from(
                ctx,
                loggedApi.list({ "path": directoryPath }),
            ).waitFor();

            ctx.done();

            dispatch(
                actions.navigationCompleted({
                    explorerType,
                    directoryPath,
                    "directoryItems": [
                        ...directories.map(basename => ({
                            basename,
                            "kind": "directory" as const,
                        })),
                        ...files.map(basename => ({ basename, "kind": "file" as const })),
                    ],
                }),
            );
        },
    "cancelNavigation":
        (params: { explorerType: "s3" | "secrets" }): ThunkAction<void> =>
        (...args) => {
            const { explorerType } = params;
            const [dispatch, getState] = args;
            if (!getState().explorers[explorerType].isNavigationOngoing) {
                return;
            }
            dispatch(actions.navigationCanceled({ explorerType }));
        },
    "refresh":
        (params: { explorerType: "s3" | "secrets" }): ThunkAction =>
        async (...args) => {
            const { explorerType } = params;

            const [dispatch, getState] = args;

            const { directoryPath } = getState().explorers[explorerType];

            if (directoryPath === undefined) {
                return;
            }

            await dispatch(thunks.navigate({ explorerType, directoryPath }));
        },
    "rename":
        (params: {
            explorerType: "secrets";
            renamingWhat: "file" | "directory";
            basename: string;
            newBasename: string;
        }): ThunkAction =>
        async (...args) => {
            const { explorerType, renamingWhat, basename, newBasename } = params;

            const [dispatch, getState, extraArg] = args;

            const contextualState = getState().explorers[explorerType];

            const { directoryPath } = contextualState;

            assert(directoryPath !== undefined);

            await dispatch(
                interUsecasesThunks.waitForNoOngoingOperation({
                    explorerType,
                    "kind": renamingWhat,
                    directoryPath,
                    basename,
                }),
            );

            dispatch(
                actions.operationStarted({
                    explorerType,
                    "kind": renamingWhat,
                    basename,
                    "operation": "rename",
                    newBasename,
                }),
            );

            await getSliceContexts(extraArg)[explorerType].loggedExtendedApi[
                (() => {
                    switch (renamingWhat) {
                        case "file":
                            return "renameFile";
                        case "directory":
                            return "renameDirectory";
                    }
                })()
            ]({
                "path": pathJoin(directoryPath, basename),
                newBasename,
            });

            dispatch(
                actions.operationCompleted({
                    explorerType,
                    "kind": renamingWhat,
                    "basename": newBasename,
                    directoryPath,
                }),
            );
        },

    "create":
        (params: ExplorersCreateParams): ThunkAction =>
        async (...args) => {
            const [dispatch, getState, extraArg] = args;

            const contextualState = getState().explorers[params.explorerType];

            const { directoryPath } = contextualState;

            assert(directoryPath !== undefined);

            await dispatch(
                interUsecasesThunks.waitForNoOngoingOperation({
                    "explorerType": params.explorerType,
                    "kind": params.createWhat,
                    directoryPath,
                    "basename": params.basename,
                }),
            );

            dispatch(
                actions.operationStarted({
                    "explorerType": params.explorerType,
                    "kind": params.createWhat,
                    "basename": params.basename,
                    "operation": "create",
                }),
            );

            const sliceContexts = getSliceContexts(extraArg);

            const path = pathJoin(directoryPath, params.basename);

            switch (params.createWhat) {
                case "file":
                    switch (params.explorerType) {
                        case "s3":
                            alert("TODO");
                            break;
                        case "secrets":
                            await sliceContexts[params.explorerType].loggedApi.put({
                                path,
                                "secret": {},
                            });
                            break;
                    }

                    break;
                case "directory":
                    switch (params.explorerType) {
                        case "s3":
                            alert("TODO");
                            break;
                        case "secrets":
                            await sliceContexts[
                                params.explorerType
                            ].loggedExtendedApi.createDirectory({ path });
                            break;
                    }

                    break;
            }

            dispatch(
                actions.operationCompleted({
                    "explorerType": params.explorerType,
                    "kind": params.createWhat,
                    "basename": params.basename,
                    directoryPath,
                }),
            );
        },

    /**
     * Assert:
     * The file or directory we are deleting is present in the directory
     * currently listed.
     */
    "delete":
        (params: {
            explorerType: "s3" | "secrets";
            deleteWhat: "file" | "directory";
            basename: string;
        }): ThunkAction =>
        async (...args) => {
            const { explorerType, deleteWhat, basename } = params;

            const [dispatch, getState, extraArg] = args;

            const contextualState = getState().explorers[params.explorerType];

            const { directoryPath } = contextualState;

            assert(directoryPath !== undefined);

            await dispatch(
                interUsecasesThunks.waitForNoOngoingOperation({
                    explorerType,
                    "kind": deleteWhat,
                    directoryPath,
                    basename,
                }),
            );

            dispatch(
                actions.operationStarted({
                    "explorerType": params.explorerType,
                    "kind": params.deleteWhat,
                    "basename": params.basename,
                    "operation": "delete",
                }),
            );

            const sliceContexts = getSliceContexts(extraArg);

            const path = pathJoin(directoryPath, basename);

            switch (explorerType) {
                case "s3":
                    alert("TODO");
                    break;
                case "secrets":
                    const sliceContext = sliceContexts[explorerType];
                    await (() => {
                        switch (deleteWhat) {
                            case "file":
                                return sliceContext.loggedApi.delete;
                            case "directory":
                                return sliceContext.loggedExtendedApi.deleteDirectory;
                        }
                    })()({ path });
                    break;
            }

            dispatch(
                actions.operationCompleted({
                    explorerType,
                    "kind": deleteWhat,
                    basename,
                    directoryPath,
                }),
            );
        },
    "getApiLogs":
        (params: { explorerType: "s3" | "secrets" }): ThunkAction<ApiLogs> =>
        (...args) => {
            const { explorerType } = params;

            const [, , extraArg] = args;

            return getSliceContexts(extraArg)[explorerType].apiLogs;
        },
    "getIsEnabled":
        (params: { explorerType: "s3" | "secrets" }): ThunkAction<boolean> =>
        (...args) => {
            const { explorerType } = params;

            const [, , { createStoreParams }] = args;

            switch (explorerType) {
                case "secrets":
                    return (
                        createStoreParams.secretsManagerClientConfig.implementation !==
                        "LOCAL STORAGE"
                    );
                case "s3":
                    return createStoreParams.s3ClientConfig.implementation !== "DUMMY";
            }
        },
};

type SliceContexts = {
    s3: SliceContexts.S3;
    secrets: SliceContexts.Secrets;
};

namespace SliceContexts {
    export type Common<loggedApi> = {
        loggedApi: loggedApi;
        apiLogs: ApiLogs;
        onNavigate?: (params: { path: string }) => void;
        isLazilyInitialized: boolean;
    };

    export type S3 = Common<S3Client>;

    export type Secrets = Common<SecretsManagerClient> & {
        loggedExtendedApi: ReturnType<typeof createSecretsManagerClientExtension>;
    };
}

const { getSliceContexts } = (() => {
    const weakMap = new WeakMap<ThunksExtraArgument, SliceContexts>();

    function getSliceContexts(extraArg: ThunksExtraArgument): SliceContexts {
        let sliceContext = weakMap.get(extraArg);

        if (sliceContext !== undefined) {
            return sliceContext;
        }

        const isLazilyInitialized = false;

        sliceContext = {
            "s3": {
                ...logApi({
                    "api": extraArg.s3Client,
                    "apiLogger": s3ApiLogger,
                }),
                isLazilyInitialized,
            },
            "secrets": (() => {
                const { apiLogs, loggedApi } = logApi({
                    "api": extraArg.secretsManagerClient,
                    "apiLogger": getVaultApiLogger({
                        "clientType": "CLI",
                        "engine": (() => {
                            const { secretsManagerClientConfig } =
                                extraArg.createStoreParams;
                            switch (secretsManagerClientConfig.implementation) {
                                case "VAULT":
                                    return secretsManagerClientConfig.engine;
                                case "LOCAL STORAGE":
                                    return secretsManagerClientConfig.paramsForTranslator
                                        .engine;
                            }
                        })(),
                    }),
                });

                return {
                    loggedApi,
                    apiLogs,
                    "loggedExtendedApi": createSecretsManagerClientExtension({
                        "secretsManagerClient": loggedApi,
                    }),
                    isLazilyInitialized,
                };
            })(),
        };

        weakMap.set(extraArg, sliceContext);

        return sliceContext;
    }

    return { getSliceContexts };
})();

function createSecretsManagerClientExtension(props: {
    secretsManagerClient: SecretsManagerClient;
}) {
    const { secretsManagerClient } = props;

    const { crawl } = crawlFactory({
        "list": async ({ directoryPath }) => {
            const { directories, files } = await secretsManagerClient.list({
                "path": directoryPath,
            });

            return {
                "fileBasenames": files,
                "directoryBasenames": directories,
            };
        },
    });

    async function mvFile(params: { srcPath: string; dstPath: string; secret?: Secret }) {
        const { srcPath, dstPath } = params;

        if (pathRelative(srcPath, dstPath) === "") {
            return;
        }

        const {
            secret = (
                await secretsManagerClient.get({
                    "path": srcPath,
                })
            ).secret,
        } = params;

        await secretsManagerClient.delete({
            "path": srcPath,
        });

        await secretsManagerClient.put({
            "path": dstPath,
            secret,
        });
    }

    return {
        "renameFile": async (params: {
            path: string;
            newBasename: string;
            secret?: Secret;
        }) => {
            const { path, newBasename, secret } = params;

            await mvFile({
                "srcPath": path,
                "dstPath": pathJoin(pathDirname(path), newBasename),
                secret,
            });
        },
        "renameDirectory": async (params: { path: string; newBasename: string }) => {
            const { path, newBasename } = params;

            const { filePaths } = await crawl({ "directoryPath": path });

            await Promise.all(
                filePaths.map(filePath =>
                    mvFile({
                        "srcPath": pathJoin(path, filePath),
                        "dstPath": pathJoin(pathDirname(path), newBasename, filePath),
                    }),
                ),
            );
        },
        "createDirectory": async (params: { path: string }) => {
            const { path } = params;

            await secretsManagerClient.put({
                "path": pathJoin(path, ".keep"),
                "secret": {
                    "info": [
                        "This is a dummy secret so that this directory is kept even if there",
                        "is no other secrets in it",
                    ].join(" "),
                },
            });
        },
        "deleteDirectory": async (params: { path: string }) => {
            const { path } = params;

            const { filePaths } = await crawl({ "directoryPath": path });

            await Promise.all(
                filePaths
                    .map(filePathRelative => pathJoin(path, filePathRelative))
                    .map(filePath =>
                        secretsManagerClient.delete({
                            "path": filePath,
                        }),
                    ),
            );
        },
    };
}

function removeIfPresent(
    directoryItems: WritableDraft<{
        kind: "file" | "directory";
        basename: string;
    }>[],
    item: { kind: "file" | "directory"; basename: string },
): void {
    const index = directoryItems.findIndex(
        item_i => item_i.kind === item.kind && item_i.basename === item.basename,
    );

    assert(index >= 0);

    directoryItems.splice(index, 1);
}

export const selectors = (() => {
    const explorerTypes = ["s3", "secrets"] as const;

    type ExplorerType = typeof explorerTypes[number];

    type CwdIconsVue = {
        directoryPath: string;
        isNavigationOngoing: boolean;
        directories: string[];
        files: string[];
        directoriesBeingCreated: string[];
        directoriesBeingRenamed: string[];
        filesBeingCreated: string[];
        filesBeingRenamed: string[];
    };

    const cwdIconsVue = (
        rootState: RootState,
    ): Record<ExplorerType, CwdIconsVue | undefined> => {
        const state = rootState.explorers;

        return Object.fromEntries(
            explorerTypes.map(explorerType => {
                const contextualState = state[explorerType];

                const {
                    directoryPath,
                    isNavigationOngoing,
                    directoryItems,
                    ongoingOperations,
                } = contextualState;

                return [
                    explorerType,
                    ((): CwdIconsVue | undefined => {
                        if (directoryPath === undefined) {
                            return undefined;
                        }

                        return {
                            directoryPath,
                            isNavigationOngoing,
                            ...(() => {
                                const selectOngoing = memoize(
                                    (
                                        kind: "directory" | "file",
                                        operation: "create" | "rename",
                                    ) =>
                                        ongoingOperations
                                            .filter(
                                                o =>
                                                    o.directoryPath === directoryPath &&
                                                    o.kind === kind &&
                                                    o.operation === operation,
                                            )
                                            .map(({ basename }) => basename),
                                );

                                const select = (kind: "directory" | "file") =>
                                    [
                                        ...directoryItems
                                            .filter(item => item.kind === kind)
                                            .map(({ basename }) => basename),
                                        ...selectOngoing(kind, "create"),
                                        ...selectOngoing(kind, "rename"),
                                    ].sort((a, b) => a.localeCompare(b));

                                return {
                                    "directories": select("directory"),
                                    "files": select("file"),
                                    "directoriesBeingCreated": selectOngoing(
                                        "directory",
                                        "create",
                                    ),
                                    "directoriesBeingRenamed": selectOngoing(
                                        "directory",
                                        "rename",
                                    ),
                                    "filesBeingCreated": selectOngoing("file", "create"),
                                    "filesBeingRenamed": selectOngoing("file", "rename"),
                                };
                            })(),
                        };
                    })(),
                ] as const;
            }),
        ) as any;
    };

    return { cwdIconsVue };
})();
