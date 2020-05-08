const { promises: fsPromises } = require('fs')
const path = require('path')
const colors = require('colors')
const glob = require('glob-promise')

let keepArtifactsDir = path.dirname(
  require.resolve("@keep-network/keep-core/artifacts/KeepToken.json"))

let localArtifacts = path.join(__dirname, '/artifacts/')

glob(path.join(keepArtifactsDir, '/*.json')).then((files) => {

  let dirResult = fsPromises.mkdir(localArtifacts).then(
    v => v,
    err => {
      if (err.code && err.code === 'EEXIST') {
        console.warn('Artifacts directory exists...')
      } else {
        throw err
      }
    }
  )

  let results = files.map((file) => {
    let base = path.basename(file)
    let newFile = path.join(localArtifacts, path.basename(file))
    return fsPromises.copyFile(file, newFile).then(
      () => console.log('Copied artifact: ', base.green),
      (err) => console.error(`Couldn't copy artifact: ${base.red}`)
    )
  })

  return Promise.all([dirResult].concat(results)).then(
    (values) => console.log('Successfully copied Keep contract artifacts!'.green)
  )
}).then(
  (v) => v,
  (err) => console.error(
    'Error copying Keep contract artifacts!',
    err.toString().red
  )
)
