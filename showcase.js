const { writeFile } = require('fs/promises')
const fetchOpts = {headers: {'User-Agent': 'Googlebot'}}
const fetchDomain = 'https://www.elderscrollsonline.com'

async function getShowcaseDetails() {
	const response = await fetch(fetchDomain + '/en-us/news/category/crown-store', fetchOpts)
	const html = await response.text()

	let m, showcaseDate, currentSlug, previousSlug
	const regex = /Crown Store Showcase—(\S+ \d{4})">.+?href="(.+?)"/gs

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
	const [,cleanHtml] = html.replace(/’/g, '\'').replace(/[“”]/g, '"').replace(/-/g, '-').replace(/&nbsp;/g, ' ').replace(/undaunted key/g, 'Undaunted key').split('id="text_block1"')

	const regex = /(?:<img .+?data-lazy-src="(.+?(\w{32}).+?)".+?>|<p>(.+?)<\/p>)/gs
	let currentImage, currentTitle, m
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
		} else if (m[3] != ' ' && m[3] != '<br>') {
			const line = m[3].replace(/[\n\r]/g, '').replace(/<.> <\/.>/g, ' ').replace(/ +/g, ' ')

			if (line.substring(0, 3) == '<b>' && line.substring(line.length-4) == '</b>') {
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

					if (currentTitle && currentTitle.substring(0, 21) == 'Crown Crafting Motif:') {
						for (const chunk of desc.split('. ')) {
							if (chunk.substring(0, 28) == 'Also has a chance to drop by') {
								const name = currentTitle.substring(21).trim()

								results[currentTitle].ingame = {
									name: name + ' Crafting Motif',
									source: 'The ' + name + ' Crafting Motif has a chance to drop by' + chunk.substring(28),
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
						
						if ((m = /(\w+) (\d{1,2})(?:, (\d{4}))?,? to (\w+) (\d{1,2})(?:, (\d{4}))?/.exec(chunk)) !== null) {
							const [, startMonth, startDay, startYear, endMonth, endDay, endYear] = m
							const startDate = new Date(`${startDay} ${startMonth} ${startYear ?? endYear}`)
							const endDate = new Date(`${endDay} ${endMonth} ${endYear}`)
							startDate.setHours(14)
							endDate.setHours(14)
	
							results[currentTitle].startDate = startDate
							results[currentTitle].endDate = endDate
							u = true
						} else if ((m = /(\w+) (\d{1,2})(?:, (\d{4}))?/.exec(chunk)) !== null) {
							const [, month, day, year] = m
							const date = new Date(`${day} ${month} ${year}`)
							date.setHours(14)
	
							results[currentTitle].startDate = date
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
		.filter(result => result.startDate)
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
		.filter(item => !item.endDate || item.endDate > showcaseDate)

	items
		.sort((a,b) => a.startDate - b.startDate)

	await writeFile('./showcase.json', JSON.stringify({showcaseDate, items}))
})()