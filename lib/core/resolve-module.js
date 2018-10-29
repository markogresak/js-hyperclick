'use babel'
// @flow
import path from 'path'
import fs from 'fs'
import { sync as resolve } from 'resolve'
import type { Resolved } from '../types'

// Default comes from Node's `require.extensions`
const defaultExtensions = ['.js', '.json', '.node']
const webpackConfigFiles = [
  'webpack.config.js',
  'webpack/webpack.config.js',
  'webpack/config.js',
  'webpack/app.config.js',
]
const ignoredModules = ['node_modules']
type ResolveOptions = {
  extensions?: typeof defaultExtensions,
}

function findConfigFile(basedir, fileName) {
  const packagePath = path.resolve(basedir, fileName)
  try {
    fs.accessSync(packagePath)
  } catch (e) {
    const parent = path.resolve(basedir, '../')
    if (parent != basedir) {
      return findConfigFile(parent, fileName)
    }
    return undefined
  }
  return packagePath
}

function getWebpackContext(webpackConfigFile) {
  if (!webpackConfigFile) {
    return undefined
  }

  try {
    const {
      context,
      resolve: { modules },
    } = require(webpackConfigFile)
    return modules
      .filter((m) => m && ignoredModules.includes(m))
      .map((m) => path.resolve(context, m))
  } catch (e) {
    return undefined
  }
}

function loadWebpackRoots(basedir) {
  return webpackConfigFiles
    .map((fileName) => getWebpackContext(findConfigFile(basedir, fileName)))
    .reduce((contexts, c) => (Array.isArray(c) ? [...contexts, ...c] : contexts), [])
}

function loadModuleRoots(basedir) {
  const packagePath = findConfigFile(basedir, 'package.json')
  if (!packagePath) {
    return
  }
  const config = JSON.parse(String(fs.readFileSync(packagePath)))

  if (config && config.moduleRoots) {
    let roots = config.moduleRoots
    if (typeof roots === 'string') {
      roots = [roots]
    }

    const packageDir = path.dirname(packagePath)
    return roots.map((r) => path.resolve(packageDir, r))
  }
}

function resolveWithCustomRoots(basedir, absoluteModule, options) {
  const { extensions = defaultExtensions } = options
  const moduleName = `./${absoluteModule}`

  const moduleRoots = loadModuleRoots(basedir) || []

  const roots = [...loadWebpackRoots(basedir), ...moduleRoots]

  const resolveOptions = { basedir, extensions }
  for (let i = 0; i < roots.length; i++) {
    resolveOptions.basedir = roots[i]

    try {
      return resolve(moduleName, resolveOptions)
    } catch (e) {
      /* do nothing */
    }
  }
}

export default function resolveModule(
  filePath: string,
  suggestion: { moduleName: string },
  options: ResolveOptions = {},
): Resolved {
  const { extensions = defaultExtensions } = options
  let { moduleName } = suggestion

  const basedir = path.dirname(filePath)
  const resolveOptions = { basedir, extensions }

  let filename

  try {
    filename = resolve(moduleName, resolveOptions)
    if (filename == moduleName) {
      return {
        type: 'url',
        url: `http://nodejs.org/api/${moduleName}.html`,
      }
    }
  } catch (e) {
    if (moduleName === 'atom') {
      return {
        type: 'url',
        url: `https://atom.io/docs/api/latest/`,
      }
    }
  }

  // Allow linking to relative files that don't exist yet.
  if (!filename && moduleName[0] === '.') {
    if (path.extname(moduleName) == '') {
      moduleName += '.js'
    }

    filename = path.join(basedir, moduleName)
  } else if (!filename) {
    filename = resolveWithCustomRoots(basedir, moduleName, options)
  }

  return { type: 'file', filename }
}
