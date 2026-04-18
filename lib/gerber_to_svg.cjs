// Called by gerber_zip_files controller action.
// Reads JSON from stdin: { files: [{name, content}, ...] }
// Writes JSON to stdout: { top, bottom } SVG strings
'use strict'
const pcbStackup = require('../node_modules/pcb-stackup/index.js')
const { Readable } = require('stream')

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  const files = JSON.parse(input)
  const layers = files.map(({ name, content }) => ({
    filename: name,
    gerber: Readable.from([content]),
  }))

  pcbStackup(layers, { outlineGapFill: 0.011 }, (err, stackup) => {
    if (err) { process.stderr.write(err.message); process.exit(1) }
    process.stdout.write(JSON.stringify({ top: stackup.top.svg, bottom: stackup.bottom.svg }))
  })
})
