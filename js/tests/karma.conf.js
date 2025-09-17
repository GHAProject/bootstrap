'use strict'

const path = require('node:path')
const ip = require('ip')
const { babel } = require('@rollup/plugin-babel')
const istanbul = require('rollup-plugin-istanbul')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const replace = require('@rollup/plugin-replace')
const { browsers } = require('./browsers.js')

const ENV = process.env
const BROWSERSTACK = Boolean(ENV.BROWSERSTACK)
const DEBUG = Boolean(ENV.DEBUG)
const JQUERY_TEST = Boolean(ENV.JQUERY)
const IS_CI = String(ENV.CI || '').toLowerCase() === 'true'

const frameworks = ['jasmine']
const plugins = [
  'karma-jasmine',
  'karma-rollup-preprocessor',
  'karma-chrome-launcher',        // ensure Chrome launcher is available
  'karma-detect-browsers'
]
const reporters = ['dots']

// No-sandbox Chrome for CI + stability flags
const customLaunchers = {
  ChromeHeadlessCI: {
    base: 'ChromeHeadless',
    flags: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1920,1080'
    ]
  }
}

// Auto-detect locally; force our CI launcher on runners
const detectBrowsers = {
  usePhantomJS: false,
  postDetection(available) {
    if (IS_CI) return ['ChromeHeadlessCI']

    if (available.includes('Chrome'))    return DEBUG ? ['Chrome']    : ['ChromeHeadless']
    if (available.includes('Chromium'))  return DEBUG ? ['Chromium']  : ['ChromiumHeadless']
    if (available.includes('Firefox'))   return DEBUG ? ['Firefox']   : ['FirefoxHeadless']

    throw new Error('Please install Chrome, Chromium or Firefox')
  }
}

const config = {
  basePath: '../..',
  port: 9876,
  colors: true,
  singleRun: true,
  autoWatch: false,
  concurrency: Number.POSITIVE_INFINITY,
  customLaunchers,

  client: {
    clearContext: false,
    jasmine: {
      // increase per-spec timeout for CI flakiness (focus, timers, etc.)
      timeoutInterval: IS_CI ? 20000 : 5000
    }
  },

  // Prevent flaky disconnects / slow CI hiccups
  captureTimeout: IS_CI ? 120000 : 60000,
  browserNoActivityTimeout: IS_CI ? 120000 : 60000,
  browserDisconnectTimeout: IS_CI ? 60000 : 10000,
  browserDisconnectTolerance: IS_CI ? 2 : 0,

  files: [
    'node_modules/hammer-simulator/index.js',
    {
      pattern: 'js/tests/unit/**/!(jquery).spec.js',
      watched: !BROWSERSTACK
    }
  ],

  preprocessors: {
    'js/tests/unit/**/*.spec.js': ['rollup']
  },

  rollupPreprocessor: {
    plugins: [
      replace({ 'process.env.NODE_ENV': '"dev"', preventAssignment: true }),
      istanbul({
        exclude: [
          'node_modules/**',
          'js/tests/unit/**/*.spec.js',
          'js/tests/helpers/**/*.js'
        ]
      }),
      babel({ exclude: 'node_modules/**', babelHelpers: 'inline' }),
      nodeResolve()
    ],
    output: {
      format: 'iife',
      name: 'bootstrapTest',
      sourcemap: 'inline',
      generatedCode: 'es2015'
    }
  }
}

// --- BrowserStack branch
if (BROWSERSTACK) {
  config.hostname = ip.address()
  config.browserStack = {
    username: ENV.BROWSER_STACK_USERNAME,
    accessKey: ENV.BROWSER_STACK_ACCESS_KEY,
    build: `bootstrap-${ENV.GITHUB_SHA ? `${ENV.GITHUB_SHA.slice(0, 7)}-` : ''}${new Date().toISOString()}`,
    project: 'Bootstrap',
    retryLimit: 2
  }
  plugins.push('karma-browserstack-launcher', 'karma-jasmine-html-reporter')
  config.customLaunchers = { ...customLaunchers, ...browsers }
  config.browsers = Object.keys(browsers)
  reporters.push('BrowserStack', 'kjhtml')
}
// --- jQuery test branch
else if (JQUERY_TEST) {
  frameworks.push('detectBrowsers')
  plugins.push('karma-firefox-launcher')
  config.detectBrowsers = detectBrowsers
  config.files = [
    'node_modules/jquery/dist/jquery.slim.min.js',
    { pattern: 'js/tests/unit/jquery.spec.js', watched: false }
  ]
}
// --- default branch (coverage etc.)
else {
  frameworks.push('detectBrowsers')
  plugins.push('karma-firefox-launcher', 'karma-coverage-istanbul-reporter')
  reporters.push('coverage-istanbul')
  config.detectBrowsers = detectBrowsers
  config.coverageIstanbulReporter = {
    dir: path.resolve(__dirname, '../coverage/'),
    reports: ['lcov', 'text-summary'],
    thresholds: {
      emitWarning: false,
      global: { statements: 90, branches: 89, functions: 90, lines: 90 }
    }
  }
  if (DEBUG) {
    config.hostname = ip.address()
    plugins.push('karma-jasmine-html-reporter')
    reporters.push('kjhtml')
    config.singleRun = false
    config.autoWatch = true
  }
}

config.frameworks = frameworks
config.plugins = plugins
config.reporters = reporters

module.exports = karmaConfig => {
  config.logLevel = karmaConfig.LOG_ERROR
  karmaConfig.set(config)
}
