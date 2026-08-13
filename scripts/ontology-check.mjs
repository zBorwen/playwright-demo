#!/usr/bin/env node
/**
 * ontology-check.mjs
 * 根据 ontology/project-ontology.yaml 中的可执行规则校验代码库。
 * 运行：pnpm ontology:check
 * 支持规则（rules[].checker）：
 *   - no-any            : 禁止 any 类型（本体 exemptions 可豁免，如 __tests__）
 *   - naming            : 命名规范（含 React 组件 / Zod schema / 测试文件惯例豁免）
 *   - max-lines         : 单文件行数上限
 *   - commit-format     : 提交信息格式（跳过 merge 提交）
 *   - dependency-boundary : 包间依赖边界
 * 例外（exemptions）是本体的一部分：规则可以声明豁免路径，豁免即知识。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ONTOLOGY = YAML.parse(
  readFileSync(resolve(ROOT, 'ontology/project-ontology.yaml'), 'utf8'),
)

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'storage', '.playwright-mcp', '.claude', '.agents', 'test-results', 'coverage'])
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const issues = []

function report(level, ruleId, file, message) {
  issues.push({ level, ruleId, file, message })
}

/** 本体豁免匹配：支持 glob 简单展开（如 __tests__ 目录） */
function isExempt(pattern, file) {
  if (!pattern) return false
  if (pattern === '**/__tests__/**') return file.includes('/__tests__/')
  if (pattern.startsWith('**/')) return file.includes(pattern.slice(2))
  if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -2))
  return file === pattern
}

function exemptionsFor(ruleId) {
  const rule = ONTOLOGY.rules.find((r) => r.id === ruleId)
  return rule?.exemptions || []
}

function isExemptFile(ruleId, file) {
  return exemptionsFor(ruleId).some((p) => isExempt(p, file))
}

// ---------- 文件遍历 ----------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (SOURCE_EXT.has(entry.slice(entry.lastIndexOf('.')))) out.push(full)
  }
  return out
}

function sourceFiles() {
  const files = []
  for (const pkg of ONTOLOGY.classes.Package.individuals) {
    const dir = resolve(ROOT, 'packages', pkg)
    try {
      files.push(...walk(dir).map((f) => relative(ROOT, f)))
    } catch {
      // 包目录不存在则跳过
    }
  }
  return files
}

/** 去掉字符串字面量与注释后的代码（简单近似） */
function stripCode(line) {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/\/\*.*?\*\//g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

// ---------- 规则实现 ----------

function checkNoAny(files) {
  const bad = /:\s*any\b|<any>|\bas any\b|Array<any>|Promise<any>/
  for (const file of files) {
    if (isExemptFile('code.ts-complete-types', file)) continue
    const lines = readFileSync(resolve(ROOT, file), 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (bad.test(stripCode(line))) {
        report('error', 'code.ts-complete-types', `${file}:${i + 1}`, `禁止 any：${line.trim().slice(0, 80)}`)
      }
    })
  }
}

function checkNaming(files) {
  const varRe = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g
  const fnRe = /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g
  // 类型声明：type/class/interface 后接标识符，但排除 msg.type as / import type 等语法
  const classRe = /(?<![.\w])(?:class|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b(?!\s*[;:=<,])/g
  const camel = /^[a-z][a-zA-Z0-9]*$/
  const pascal = /^[A-Z][a-zA-Z0-9]*$/
  const upperSnake = /^[A-Z][A-Z0-9_]*$/

  for (const file of files) {
    if (isExemptFile('naming.standard', file)) continue
    const isTsx = file.endsWith('.tsx')
    const lines = readFileSync(resolve(ROOT, file), 'utf8').split('\n')
    lines.forEach((line, i) => {
      const stripped = stripCode(line)
      // 变量/常量
      for (const m of stripped.matchAll(varRe)) {
        const name = m[1]
        if (upperSnake.test(name)) continue // UPPER_SNAKE 常量
        if (name.startsWith('__')) continue // Node 内建
        if (name.startsWith('_')) continue // 哨兵
        if (pascal.test(name) && (isTsx || /Schema$/.test(name))) continue // React 组件 / Zod schema
        if (!camel.test(name)) {
          report('warning', 'naming.standard', `${file}:${i + 1}`, `变量/常量命名应为 camelCase 或 UPPER_SNAKE_CASE：${name}`)
        }
      }
      // 函数
      for (const m of stripped.matchAll(fnRe)) {
        const name = m[1]
        if (isTsx && pascal.test(name)) continue // React 组件
        if (!camel.test(name)) {
          report('warning', 'naming.standard', `${file}:${i + 1}`, `函数命名应为 camelCase：${name}`)
        }
      }
      // 类/接口/类型
      for (const m of stripped.matchAll(classRe)) {
        const name = m[1]
        if (!pascal.test(name)) {
          report('warning', 'naming.standard', `${file}:${i + 1}`, `类/接口/类型命名应为 PascalCase：${name}`)
        }
      }
    })
    // 文件名 kebab-case（允许 .test/.spec/.d 后缀，React 组件文件与 *.config.* 允许惯例命名）
    const base = file.split('/').pop().replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '')
    const stem = base.replace(/\.(test|spec|d)$/, '')
    if (!/^[a-z0-9-]+$/.test(stem)) {
      const isComponentFile = isTsx && pascal.test(stem)
      const isConfigFile = /\.config$/.test(stem)
      if (!isComponentFile && !isConfigFile) {
        report('warning', 'naming.standard', file, `文件名应为 kebab-case：${base}`)
      }
    }
  }
}

function checkMaxLines(files) {
  const limit = ONTOLOGY.properties.limits.maxLinesPerFile
  for (const file of files) {
    if (isExemptFile('size.max-lines', file)) continue
    const n = readFileSync(resolve(ROOT, file), 'utf8').split('\n').length
    if (n > limit) {
      report('error', 'size.max-lines', file, `${n} 行超过上限 ${limit}`)
    }
  }
}

function checkCommitFormat() {
  const types = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore']
  const re = new RegExp(`^(${types.join('|')}): (.+)$`)
  const maxChars = ONTOLOGY.properties.limits.commitSubjectMaxChars
  let log
  try {
    log = execSync('git log --no-merges --format=%s -n 20', { cwd: ROOT, encoding: 'utf8' })
  } catch {
    report('error', 'git.commit-format', 'git', '无法读取 git log')
    return
  }
  for (const line of log.split('\n').filter(Boolean)) {
    const m = line.match(re)
    if (!m) {
      report('warning', 'git.commit-format', 'git', `历史债务：提交信息不符合 "<类型>: <描述>" 格式：${line}`)
      continue
    }
    if (m[2].length > maxChars) {
      report('warning', 'git.commit-format', 'git', `历史债务：提交描述超过 ${maxChars} 字：${line}`)
    }
  }
}

function checkDependencyBoundary() {
  const allowed = ONTOLOGY.relations.dependsOn
  for (const pkg of Object.keys(allowed)) {
    const pkgJsonPath = resolve(ROOT, 'packages', pkg, 'package.json')
    let pkgJson
    try {
      pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
    } catch {
      report('error', 'dependency.boundary', `packages/${pkg}`, 'package.json 缺失')
      continue
    }
    const deps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) }
    const workspaceDeps = Object.keys(deps).filter((d) => d.startsWith('@playwright-demo/'))
    for (const dep of workspaceDeps) {
      const short = dep.replace('@playwright-demo/', '')
      if (!(allowed[pkg] || []).includes(short)) {
        report('error', 'dependency.boundary', `packages/${pkg}/package.json`, `不允许依赖 ${dep}（本体 relations.dependsOn.${pkg} 仅允许: ${allowed[pkg].join(', ') || '无'})`)
      }
    }
  }
}

// ---------- 调度 ----------

function run() {
  const files = sourceFiles()
  const argRules = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const filter = argRules.length ? new Set(argRules) : null

  if (!filter || filter.has('no-any')) checkNoAny(files)
  if (!filter || filter.has('naming')) checkNaming(files)
  if (!filter || filter.has('max-lines')) checkMaxLines(files)
  if (!filter || filter.has('commit-format')) checkCommitFormat()
  if (!filter || filter.has('dependency-boundary')) checkDependencyBoundary()

  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')

  console.log(`\n校验完成：扫描 ${files.length} 个源文件，${errors.length} 错误，${warnings.length} 警告\n`)
  for (const i of issues) {
    console.log(`  [${i.level.toUpperCase()}] ${i.ruleId} ${i.file}: ${i.message}`)
  }
  console.log('')
  process.exit(errors.length ? 1 : 0)
}

run()
