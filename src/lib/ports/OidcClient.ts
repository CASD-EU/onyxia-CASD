
import type { StatefulReadonlyEvt } from "evt";
import { nonNullable } from "evt";
import * as jwtSimple from "jwt-simple";
import type { KcLanguageTag } from "keycloakify";




export type OidcTokens = Readonly<{
    accessToken: string;
    idToken: string;
    refreshToken: string;
}>;

export declare type OidcClient =
    OidcClient.LoggedIn |
    OidcClient.NotLoggedIn;

export declare namespace OidcClient {

    export type NotLoggedIn = {

        isUserLoggedIn: false;

        login(
            /** The href of the route to redirect to without domain but including path, query string, and hash. */
            params?: {
                redirectHref: string;
            }
        ): Promise<never>;
    };

    export type LoggedIn = {

        isUserLoggedIn: true;

        evtOidcTokens: StatefulReadonlyEvt<OidcTokens | undefined>;

        /** Returns number of seconds before the tokens expires */
        getOidcTokensRemandingValidity(): number;

        /**
         * Renew the token if it has less than minValidity seconds left before it expires.
         * 
         * @param minValidity — If not specified, 10 is used.
         */
        renewOidcTokensIfExpiresSoonOrRedirectToLoginIfAlreadyExpired(
            params?: { 
                minValidity?: number; 
            }
        ): Promise<void>;

        logout(): Promise<never>;

    };


}


export type ParsedJwt = {
    email: string;
    family_name: string; //Obama
    given_name: string; //Barack
    preferred_username: string; //obarack, the idep
    groups: string[];
    locale: KcLanguageTag;
};

export async function parseOidcAccessToken(
    oidcClient: Pick<OidcClient.LoggedIn, "evtOidcTokens" | "renewOidcTokensIfExpiresSoonOrRedirectToLoginIfAlreadyExpired">
): Promise<ParsedJwt> {

    const parsedJwt = jwtSimple.decode(
        (await oidcClient.evtOidcTokens.waitFor(nonNullable())).accessToken,
        "",
        true
    ) as ParsedJwt;

    return parsedJwt;

}
