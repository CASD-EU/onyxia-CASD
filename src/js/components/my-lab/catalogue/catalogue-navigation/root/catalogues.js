import React, { useEffect, useState } from 'react';
import Grid from '@material-ui/core/Grid';
import Catalogue from '../catalogue.component';
import { restApiPaths } from 'js/restApiPaths';
import { useIsBetaModeEnabled } from "app/interfaceWithLib/hooks";
import { prAxiosInstance } from "lib/setup";

const Catalogues = () => {
	const [catalogs, setCatalogs] = useState([]);
	const { isBetaModeEnabled } = useIsBetaModeEnabled();

	useEffect(() => {

		(async () => {

			(await prAxiosInstance)(restApiPaths.catalogue)
				.then(({ data }) => data)
				.then((resp) => {

					console.log(JSON.stringify(resp.catalogs, null, 2));

					setCatalogs(resp.catalogs);
				});

		})();

	}, []);

	return (
		<div className="contenu catalogue">
			<Grid container spacing={2}>
				{catalogs
					.filter((catalogue) => catalogue.status === 'PROD' || isBetaModeEnabled)
					.map((catalogue) => (
						<Catalogue catalogue={catalogue} key={catalogue.id} />
					))}
			</Grid>
		</div>
	);
};

export default Catalogues;
