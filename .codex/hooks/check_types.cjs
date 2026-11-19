const path = require("node:path")
const { createRequire } = require("node:module")

const requireFromApp = createRequire(path.join(process.cwd(), "package.json"))
const ts = requireFromApp("typescript")
const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists)
const config = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(
  config.config ?? {},
  ts.sys,
  path.dirname(configPath),
  { noEmit: true },
  configPath
)
const program = ts.createProgram(parsed.fileNames, parsed.options)
const diagnostics = [
  ...[config.error].filter(Boolean),
  ...parsed.errors,
  ...program.getOptionsDiagnostics(),
  ...program.getGlobalDiagnostics(),
]

for (const file of process.argv.slice(2)) {
  const source = program.getSourceFile(path.resolve(file))
  if (source) {
    diagnostics.push(
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source)
    )
  }
}

if (diagnostics.length) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: ts.sys.useCaseSensitiveFileNames ? name => name : name => name.toLowerCase(),
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }))
  process.exitCode = 1
}
