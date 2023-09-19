const { showcaseDate, items } = require('./showcase.json')
const { readFile } = require('fs/promises')
const archiver = require('archiver'),
	core = require('@actions/core'),
	fetch = require('node-fetch'),
	FormData = require('form-data')

function generateReleaseLua(items) {
	let lua = 'local releases = {'

	for (const item of items) {
		let name, source, type

		if (item.ingame) {
			// ignore motifs with an end date, likely already released
			if (item.ingame.source == 'motif' && item.endDate) {
				continue
			}

			name = item.ingame.name
			source = item.ingame.source.replace(/["\n]/g, '\\$&').replace(/\* (.+)/g, '|t16:16:/esoui/art/miscellaneous/bullet.dds|t $1')
			type = item.ingame.type
		} else if (item.esoPlusFreebie) {
			name = item.title
			type = 'esoPlusFreebie'
		} else {
			continue
		}

		lua += `
	{
		id = "${item.id}",
		name = "${name.replace(/"/g, '\\"')}",
		type = "${type}",
		startDate = ${item.startDate / 1000},`

		if (item.endDate) {
			lua += `
		endDate = ${item.endDate / 1000},`
		}
		
		if (source) {
			lua += `
		source = "${source}",`
		}

		lua += `
	},`
	}

	lua += `
}

`

	return lua
}

async function getLatestApiVersion() {
	const response = await fetch('https://raw.githubusercontent.com/esoui/esoui/master/README.md')
	const html = await response.text()

	let m

	if ((m = /API (\d+)/.exec(html)) !== null) {
		return m[1]
	}
}

async function getLatestAddonVersion() {
	const response = await fetch(
		'https://api.esoui.com/addons/details/' + process.env.ADDON_ID + '.json',
		{
			headers: {
				'x-api-token': process.env.API_TOKEN
			}
		}
	)
	const json = await response.json()

	return json[0].version
}

async function upload(body) {
	const response = await fetch(
		'https://api.esoui.com/addons/update',
		{
			headers: {
				'x-api-token': process.env.API_TOKEN
			},
			method: 'POST',
			body
		}
	)

	return response.status
}

(async () => {
	const sDate = new Date(showcaseDate)
	let addonVersion = sDate.getFullYear() + '.' + (sDate.getMonth()+1) + core.getInput('ExtraVersion')
	let latestAddonVersion = await getLatestAddonVersion()
	core.info('Addon Version ' + addonVersion)

	if (addonVersion == latestAddonVersion.slice(0, addonVersion.length)) {
		core.notice('Version matched existing release')
		return
	}

	lua = generateReleaseLua(items)
	lua += await readFile('addons/ReleaseTracker.lua', 'utf8')

	const apiVersion = await getLatestApiVersion()
	core.info('API Version ' + apiVersion)

	let readme = await readFile('addons/ReleaseTracker.txt', 'utf8')
	readme = readme
		.replace('$ADDONVERSION', addonVersion)
		.replace('$APIVERSION', apiVersion)

	const archive = archiver('zip')
	archive.append(lua, {name: 'ReleaseTracker/ReleaseTracker.lua'})
	archive.append(readme, {name: 'ReleaseTracker/ReleaseTracker.txt'})
	archive.finalize()

	const formData = new FormData()
	formData.append('id', process.env.ADDON_ID)
	formData.append('version', addonVersion)
	formData.append('updatefile', archive, `ReleaseTracker-${addonVersion}.zip`)

	await upload(formData)
	core.notice('Release uploaded')
})()