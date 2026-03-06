/**
 * Trifacta Inc. Confidential
 *
 * Copyright 2015 Trifacta Inc.
 * All Rights Reserved.
 *
 * Any use of this material is subject to the Trifacta Inc., Source License located
 * in the file 'SOURCE_LICENSE.txt' which is part of this package.  All rights to
 * this material and any derivative works thereof are reserved by Trifacta Inc.
 *
 * Modified by charlag
 */

async function restoreStacktrace(options) {
	const {stacktrace, fetcher} = options

	const lines = stacktrace.split('\n');
	let result = '';

	for (let stackLine of lines) {
		stackLine = stackLine.trim();

		if (isAtWordLine(stackLine)) {
			const parsed = parseAtWordLine(stackLine)
			result += await outputLine(fetcher, stackLine, parsed)
		} else {
			const atSymbolLine = parseAtSymbolLine(stackLine)
			if (atSymbolLine != null) {
				result += await outputLine(fetcher, stackLine, atSymbolLine)
			} else {
				result += stackLine;
			}
		}

		result += '\n';
	}

	return result;
}

function isAtWordLine(line) {
	return line.startsWith("at ")
}

function isAtSymbolLine(line) {
	return line.includes("@")
}

function parseAtWordLine(stackLine) {
	// bare: " at http://something/bundle.js:1:1"
	// named: " at bla.bla (http://something/bundle.js:1:1)"

	const bareMatch = stackLine.match(/\s*at (new|async)?\s*([^\s]+):(\d+):(\d+)/)
	if (bareMatch) {
		const [_, modifier, fileUrl, sourceLine, sourceColumn] = bareMatch
		const parsedFileUrl = new URL(fileUrl)
		const bundleFile = parsedFileUrl.pathname.split("/").at(-1)
		return {
			sourceLine: parseInt(sourceLine),
			sourceColumn: parseInt(sourceColumn),
			bundleFile,
			compiledName: modifier,
		}
	}
	const namedMatch = stackLine.match(/\s*at (new|async)?\s*([^\s]+) \((([^\s]+):(\d+):(\d+)|<anonymous>)\)/)
	if (namedMatch) {
		const [_, modifier, compiledName, location, fileUrl, sourceLine, sourceColumn] = namedMatch
		if (location === "<anonymous>") {
			return {
				compiledName: (modifier ? (modifier + " ") : "") + compiledName,
			}
		}
		const parsedFileUrl = new URL(fileUrl)
		const bundleFile = parsedFileUrl.pathname.split("/").at(-1)
		return {
			sourceLine: parseInt(sourceLine),
			sourceColumn: parseInt(sourceColumn),
			bundleFile,
			compiledName: (modifier ? (modifier + " ") : "") + compiledName,
		}
	} else {
		throw new Error(`Cannot parse line: ${stackLine}`)
	}
}

function parseAtSymbolLine(line) {
	const [compiledName, rest] = line.split("@")
	const lineColRegex = /(.*):([0-9]+):([0-9]+)/
	const lineRegex = /(.*):([0-9]+)/
	let sourceUrl, sourceLine, sourceColumn
	if (lineColRegex.test(rest)) {
		const regexArray = lineColRegex.exec(rest)
		sourceUrl = regexArray[1]
		sourceLine = parseInt(regexArray[2])
		sourceColumn = parseInt(regexArray[3])
	} else if (lineRegex.test(rest)) {
		const regexArray = lineRegex.exec(rest)
		sourceUrl = regexArray[1]
		sourceLine = parseInt(regexArray[2])
	} else {
		return null
	}
	const bundleFile = sourceUrl.substring(
		sourceUrl.lastIndexOf('/') + 1
	);
	return {
		sourceLine,
		sourceColumn,
		bundleFile,
		compiledName
	}
}

async function outputLine(fetcher, stackLine, {
	sourceLine,
	sourceColumn,
	bundleFile,
	compiledName
}) {
	let result = ""
	if (!bundleFile) {
		result += '  at ';
		result += compiledName + " "
		return result
	}
	const sourceMap = await fetcher.getMap(bundleFile);

	if (sourceMap == null) {
		return '  [original] ' + stackLine
	}
	const originalPosition = sourceMap.originalPositionFor({
		line: sourceLine,
		column: sourceColumn
	});

	let source = originalPosition.source.startsWith("webpack:///")
		? originalPosition.source.substring('webpack:///'.length, originalPosition.source.length)
		: originalPosition.source

	// remove last ? part
	if (source.lastIndexOf('?') > source.lastIndexOf('/')) {
		source = source.substring(0, source.lastIndexOf('?'));
	}

	result += '  at ';
	if (compiledName) {
		// Output compiled location too
		result += compiledName + " "
	}
	if (originalPosition.name) {
		result += originalPosition.name
	}
	result += ' (' + source + ':' + originalPosition.line + ':' + originalPosition.column + ')';
	return result
}

module.exports = restoreStacktrace;
