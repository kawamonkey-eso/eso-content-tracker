const { writeFile } = require('fs/promises')
const fetchOpts = {headers: {'User-Agent': 'Googlebot'}}
const fetchDomain = 'https://www.elderscrollsonline.com'

async function getShowcaseDetails() {
	const response = await fetch(fetchDomain + '/en-us/news/category/crown-store', fetchOpts)
	const html = await response.text()

	let m, showcaseDate, currentSlug, previousSlug
	const regex = /Crown Store Showcase—(\S+ \d{4})\s*">.+?href="(.+?)"/gs

	if ((m = regex.exec(html)) !== null) {
		showcaseDate = new Date(`1 ${m[1]}`)
		currentSlug = m[2]
	}

	if ((m = regex.exec(html)) !== null) {
		previousSlug = m[2]
	}

	return {showcaseDate, currentSlug, previousSlug}
}

async function getShowcase(slug) {
	const response = await fetch(fetchDomain + slug, fetchOpts)
	const html = await response.text()

	const [cleanHtml] = html.replace(/’/g, '\'').replace(/[“”]/g, '"').replace(/-/g, '-').replace(/&nbsp;/g, ' ').replace(/undaunted key/g, 'Undaunted key').match(/id="text_block1".+class="tags"/s)

	const regex = /(?:<img .+?data-lazy-src="(.+?(\w{32}).+?)".+?>|<p>(.+?)<\/p>)/gs
	let currentTitle, m
	let results = {}

	while ((m = regex.exec(cleanHtml)) !== null) {
		if (m.index === regex.lastIndex) {
			regex.lastIndex++
		}

		if (m[1]) {
			if (currentTitle) {
				results[currentTitle].id = m[2]
				results[currentTitle].imageUrl = m[1]
			}
		} else {
			const line = m[3].replace(/[\n\r]/g, '').replace(/<br>/g, '').replace(/<.> <\/.>/g, ' ').replace(/ +/g, ' ').trim()

			if (!line) {
				continue
			} else if (line.substring(0, 3) == '<b>' && line.substring(line.length-4) == '</b>') {
				currentTitle = line.substring(3, line.length-4).trim()

				if (currentTitle.substring(0, 10) == 'Music Box,') {
					currentTitle = 'Music Box:' + currentTitle.substring(10)
				}

				results[currentTitle] = {title: currentTitle}
			} else if (currentTitle) {
				if (line.substring(0, 3) == '<i>' && line.substring(line.length-4) == '</i>') {
					const desc = line.substring(3, line.length-4).trim()

					if (desc) {
						results[currentTitle].desc = desc
					}

					let t
					if (currentTitle && (t = /Crown Crafting Motifs?: (.+)/.exec(currentTitle)) !== null) {
						for (const chunk of desc.split('. ')) {
							if (chunk.substring(0, 25) == 'Also has a chance to drop') {
								const name = t[1]

								results[currentTitle].ingame = {
									name: name + ' Crafting Motif',
									source: 'The ' + name + ' Crafting Motif has a chance to drop' + chunk.substring(25),
									type: 'motif',
								}
							}
						}
					}
				} else {
					const armsPack = currentTitle.substring(currentTitle.length-9) == 'Arms Pack'
					let source = []

					for (const chunk of line.split('. ')) {
						let m, u

						if (/FREE,? exclusively to ESO Plus Members/.test(chunk)) {
							results[currentTitle].esoPlusFreebie = true
							u = true
						} else if (chunk.includes('ESO Plus Members will receive a discount')) {
							results[currentTitle].esoPlusDiscount = true
							u = true
						}
						
						const dates = [...chunk.matchAll(/([A-Z][a-z]+) (\d{1,2})(?:, (\d{4}))?,?(?: at (\d+) ?([AP]M) ([A-Z]{2,3}))?/g)]

						if (dates.length) {
							let endMonth, endDay, endYear, endHour, endAmPm, endTZ

							let [, startMonth, startDay, startYear, startHour, startAmPm, startTZ] = dates[0]

							if (startAmPm == 'PM') {
								startHour = parseInt(startHour) + 12
							}

							if (dates.length == 2) {
								[, endMonth, endDay, endYear, endHour, endAmPm, endTZ] = dates[1]

								if (endAmPm == 'PM') {
									endHour = parseInt(endHour) + 12
								}

								const endDate = new Date(`${endDay} ${endMonth} ${endYear} ${endHour}:00 ${endTZ}`)

								if (!isNaN(endDate)) {
									results[currentTitle].endDate = endDate
								}
							}

							const startDate = new Date(`${startDay} ${startMonth} ${startYear ?? endYear} ${startHour ?? endHour}:00 ${startTZ ?? endTZ}`)

							if (!isNaN(startDate)) {
								results[currentTitle].startDate = startDate
							}

							u = true
						}

						if (armsPack && !u) {
							source.push(chunk)
						}
					}

					if (source.length) {
						const name = currentTitle.substring(0, currentTitle.length-9).trim()

						results[currentTitle].ingame = {
							name: name + ' Style',
							source: source.join('.\n\n'),
							type: 'style',
						}
					}
				}
			}
		}
	}

	return Object.values(results)
}

(async () => {
	const {showcaseDate, currentSlug, previousSlug} = await getShowcaseDetails()

	try {
		const {showcaseDate: lastShowcaseDate} = require('./showcase.json')

		if (showcaseDate.toJSON() == lastShowcaseDate) {
			return
		}
	} catch {}

	const results = await Promise.all([getShowcase(currentSlug), getShowcase(previousSlug)])

	const items = results[0]
		.concat(results[1])
		.filter((item, i, arr) => {
			if (item.startDate && (!item.endDate || item.endDate > showcaseDate)) {
				for (const j in arr) {
					if (i <= j) {
						continue
					} else if (item.title == arr[j].title) {
						return false
					}
				}

				return true
			} else {
				return false
			}
		})

	for (const item of items) {
		if (item.ingame?.type == 'motif' && item.endDate) {
			delete item.ingame
		}
	}

	items
		.sort((a,b) => a.startDate - b.startDate)

	await writeFile('./showcase.json', JSON.stringify({showcaseDate, items}))
})()
