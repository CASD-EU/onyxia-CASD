import { S3Client } from "../ports/S3Client";

export function createDummyS3Client(): S3Client {
    return {
        "list": () =>
            Promise.resolve({
                "directories": [],
                "files": [],
            }),
        "getToken": () =>
            Promise.resolve({
                "expirationTime": Infinity,
                "accessKeyId": "",
                "secretAccessKey": "",
                "sessionToken": "",
                "acquisitionTime": Date.now(),
            }),
    };
}
