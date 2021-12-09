import { useState, useEffect } from "react";
import dayjs from "dayjs";
import Typography from "@mui/material/Typography";
import { Icon, Fab } from "@mui/material";
import Paper from "@mui/material/Paper";
import { getMinioToken } from "js/minio-client/minio-client";
import CopyableField from "js/components/commons/copyable-field";
import Loader from "js/components/commons/loader";
import FilDAriane, { fil } from "js/components/commons/fil-d-ariane";
import ExportCredentialsField from "./export-credentials-component";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import "./mon-compte.scss";
import exportMinio from "./export-credentials-minio";
import D from "js/i18n";
import S3Field from "./s3";
//import { thunks } from "lib/setup";
/*
import {
    useDispatch,
    useSelector,
    useIsBetaModeEnabled,
    useAppConstants,
} from "app/libApi";
*/
import type { Props as CopyableFieldProps } from "../commons/copyable-field";
import { LegacyThemeProvider } from "js/components/LegacyThemeProvider";
import { createGroup } from "type-route";
import { routes } from "app/routes/router";
//import { getPublicIp } from "lib/tools/getPublicIp";
import { useAsync } from "react-async-hook";

MonCompte.routeGroup = createGroup([routes.account]);

MonCompte.getDoRequireUserLoggedIn = true;

export function MonCompte() {
    //@ts-ignore
    const { isBetaModeEnabled, setIsBetaModeEnabled } = useIsBetaModeEnabled();

    const [s3loading, setS3Loading] = useState(false);

    //@ts-ignore
    const userConfigsState = useSelector(state => state.userConfigs);

    const oidcAccessToken = "";

    //@ts-ignore
    const dispatch = useDispatch();

    //@ts-ignore
    const { result: publicIp } = useAsync(getPublicIp, []);

    //@ts-ignore
    const { parsedJwt } = useAppConstants({ "assertIsUserLoggedInIs": true });
    //@ts-ignore
    const { s3 } = useSelector(state => state.user);

    useEffect(() => {
        if (!s3loading && (!s3 || !s3.AWS_EXPIRATION)) {
            setS3Loading(true);
            getMinioToken().then(() => setS3Loading(false));
        }
    }, [s3, s3loading]);

    if (!s3) return null;

    const credentials = s3;

    return (
        <LegacyThemeProvider>
            <div className="en-tete">
                <Typography variant="h2" align="center" color="textPrimary" gutterBottom>
                    {D.hello} {parsedJwt.firstName}
                </Typography>
            </div>
            <FilDAriane fil={fil.monCompte} />
            <div className="contenu mon-compte">
                <Paper className="onyxia-toolbar" elevation={1}>
                    <Fab
                        className="bouton-rouge"
                        color="primary"
                        title="logout"
                        //@ts-ignore
                        onClick={() => dispatch(thunks.app.logout())}
                    >
                        <Icon>power_settings_new_icon</Icon>
                    </Fab>
                </Paper>

                <Paper className="paragraphe" elevation={1}>
                    <Typography variant="h3" align="left">
                        {D.onyxiaProfile}
                    </Typography>
                    <S3Field
                        value={userConfigsState.userServicePassword.value}
                        //@ts-ignore
                        handleReset={() =>
                            //@ts-ignore
                            dispatch(thunks.userConfigs.renewUserServicePassword())
                        }
                    />

                    <EditableCopyableField
                        copy
                        label={D.gitUserName}
                        value={userConfigsState.gitName.value}
                        type="string"
                        onValidate={(value: string) =>
                            dispatch(
                                //@ts-ignore
                                thunks.userConfigs.changeValue({
                                    "key": "gitName",
                                    value,
                                }),
                            )
                        }
                    />
                    <EditableCopyableField
                        copy
                        label={D.gitUserEmail}
                        value={userConfigsState.gitEmail.value}
                        type="string"
                        onValidate={(value: string) =>
                            dispatch(
                                //@ts-ignore
                                thunks.userConfigs.changeValue({
                                    "key": "gitEmail",
                                    value,
                                }),
                            )
                        }
                    />
                    <EditableCopyableField
                        copy
                        label={D.gitCacheDuration}
                        value={"" + userConfigsState.gitCredentialCacheDuration.value}
                        type="string"
                        onValidate={(value: string) =>
                            dispatch(
                                //@ts-ignore
                                thunks.userConfigs.changeValue({
                                    "key": "gitCredentialCacheDuration",
                                    "value": parseInt(value) || 0,
                                }),
                            )
                        }
                    />
                    <EditableCopyableField
                        copy
                        label={D.kaggleApiToken}
                        value={userConfigsState.kaggleApiToken.value ?? ""}
                        type="string"
                        onValidate={(value: string) =>
                            dispatch(
                                //@ts-ignore
                                thunks.userConfigs.changeValue({
                                    "key": "kaggleApiToken",
                                    value,
                                }),
                            )
                        }
                    />
                </Paper>

                <Paper className="paragraphe" elevation={1}>
                    <>
                        <Typography variant="h3" align="left">
                            {D.user}
                        </Typography>
                        <CopyableField copy label="Idep" value={parsedJwt.username} />
                        <CopyableField
                            copy
                            label="Nom complet"
                            value={parsedJwt.familyName + " " + parsedJwt.firstName}
                        />
                        <CopyableField copy label="Email" value={parsedJwt.email} />
                        {/*@ts-ignore*/}
                        <CopyableField copy label="IP" value={publicIp ?? "0.0.0.0"} />
                    </>
                    <CopyableField copy label={D.oidcToken} value={oidcAccessToken} />
                </Paper>

                {credentials ? (
                    <Paper className="paragraphe" elevation={1}>
                        <Typography variant="h3" align="left">
                            {D.minioLoginInfo}
                        </Typography>
                        <Typography variant="body1" align="left">
                            {D.minioLoginExplanation}
                            {formatageDate(credentials.AWS_EXPIRATION)}.
                        </Typography>
                        <CopyableField
                            copy
                            label={D.minioAccessKey}
                            value={credentials.AWS_ACCESS_KEY_ID || ""}
                        />
                        <CopyableField
                            copy
                            label={D.minioSecretAccessKey}
                            value={credentials.AWS_SECRET_ACCESS_KEY || ""}
                        />
                        <CopyableField
                            copy
                            label={D.minioSessionToken}
                            value={credentials.AWS_SESSION_TOKEN || ""}
                        />
                        <CopyableField
                            copy
                            label={D.minioEndpoint}
                            value={credentials.AWS_S3_ENDPOINT || ""}
                        />
                        <ExportCredentialsField
                            credentials={credentials}
                            exportTypes={exportMinio}
                            text={D.exportMinio}
                        />
                    </Paper>
                ) : (
                    <Loader />
                )}
                <Paper className="paragraphe" elevation={1}>
                    <FormControlLabel
                        control={
                            <Switch
                                onChange={event => {
                                    setIsBetaModeEnabled(event.target.checked);
                                }}
                                name="checkedB"
                                color="primary"
                                checked={isBetaModeEnabled}
                            />
                        }
                        label={D.activateBetatest}
                    />
                </Paper>
            </div>
        </LegacyThemeProvider>
    );
}

const formatageDate = (date: any) => dayjs(date).format("DD/MM/YYYY à HH:mm:ss");

//TODO: Double call in strict mode
const EditableCopyableField = (props: Omit<CopyableFieldProps, "onChange">) => {
    const [value, setValue] = useState(props.value);

    return (
        <CopyableField
            {...props}
            value={value}
            onChange={(value: string) => setValue(value)}
        />
    );
};
