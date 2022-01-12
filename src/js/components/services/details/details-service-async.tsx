import { Suspense, lazy } from "react";
import Loader from "js/components/commons/loader";
import { LegacyThemeProvider } from "js/components/LegacyThemeProvider";
import { createGroup } from "type-route";
import { routes } from "ui/routes";
const OngletContent = lazy(() => import("./details-service"));

ServiceDetails.routeGroup = createGroup([routes.account]);

ServiceDetails.getDoRequireUserLoggedIn = true;

export function ServiceDetails() {
    return (
        <LegacyThemeProvider>
            <Suspense fallback={<Loader em={18} />}>
                <OngletContent />
            </Suspense>
        </LegacyThemeProvider>
    );
}
