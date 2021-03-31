
import type { Region } from "../Region";

export const regionWithLocation: Region = {
	"id": "datalab",
	"name": "DG Insee",
	"description": "A region with location data",
	"services": {
		"type": 'MARATHON',
		"defaultIpProtection": true,
		"network": 'calico',
		"namespacePrefix": 'users',
		"marathonDnsSuffix": 'marathon.containerip.dcos.thisdcos.directory',
		"expose": {
			"domain": 'lab.sspcloud.fr'
		},
		"monitoring": {
			"URLPattern": 'https://grafana.lab.sspcloud.fr/d/mZUaipcmk/app-generique?orgId=1&refresh=5s&var-id=$appIdSlug'
		},
		"cloudshell": {
			"catalogId": 'internal',
			"packageName": 'shelly'
		},
		"initScript": 'https://git.lab.sspcloud.fr/innovation/plateforme-onyxia/services-ressources/-/raw/master/onyxia-init.sh'
	},
	"data": {
		"S3": {
			"URL": "minio.example.com"
		}
	},
	"location": {
		"lat": 48.8164,
		"long": 2.3174,
		"name": "Montrouge (France)"
	}
}
