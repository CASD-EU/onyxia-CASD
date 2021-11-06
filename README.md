<p align="center">
    <img src="https://user-images.githubusercontent.com/6702424/139264787-37efc793-1d55-4fa4-a4a9-782af8357cff.png">
</p>
<p align="center">
    🥼  <i>The <a href="https://datalab.sspcloud.fr">Onyxia</a> frontend</i> 🥼
    <br>
    <br>
    <img src="https://github.com/InseeFrLab/onyxia-web/workflows/ci/badge.svg?branch=main">
    <img src="https://img.shields.io/npm/l/onyxia-ui">
</p>

<p align="center">
    <b>Don't know Onyxia yet?</b> <a href="https://github.com/InseeFrLab/onyxia">Learn about the project</a>
    <br>
    <b>Want to see the app live?</b> <a href="https://datalab.sspcloud.fr/catalog/inseefrlab-helm-charts-datascience">datalab.sspcloud.fr</a>
    <br>
    <b>New contributor?</b> <a href="https://docs.onyxia.dev">docs.onyxia.dev</a>
</p>

To release a new version, **do not create a tag manually**, simply bump the [`package.json`'s version](https://github.com/InseeFrLab/onyxia-web/blob/4842ba8fd3c2ae9c03c52b7467d3c77f6e29e9d9/package.json#L4) then push on the default branch,
the CI will takes charge of publishing on [DockerHub](https://hub.docker.com/r/inseefrlab/onyxia-web)
and creating a [GitHub release](https://github.com/InseeFrLab/onyxia-web/releases).

-   A docker image with the tag `:main` is published on DockerHub for every new commit on the `main` branch.
-   When the commit correspond to a new release (the version has changed) the image will also be tagged `:vX.Y.Z`
    and `:latest`.
-   Every commit on branches that have an open pull-request on `main` will trigger the creation of a docker image
    tagged `:<name-of-the-feature-branch>`.

A CD pipeline is also in place; The CI of this repo [triggers the CI of the GitOPS repo InseeFrLab/paris-sspcloud](https://github.com/InseeFrLab/onyxia-web/blob/ffe0ec4bc027f0993a5af6039a9f83bbe4384b39/.github/workflows/ci.yml#L169-L177). The [CI of paris-sspcloud](https://github.com/InseeFrLab/paris-sspcloud/blob/master/.github/workflows/update.yaml) checks if there is a newer version of Onyxia-web than the one already
in production. If yes, it performs the [automatic commit](https://github.com/InseeFrLab/paris-sspcloud/commit/9b21fa792a113ea16a117cdf74c7c816d36bf84e)
that cause ArgoCD to restart the relevant pods.
