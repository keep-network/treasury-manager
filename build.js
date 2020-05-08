const { promises: fsPromises } = require('fs')
const path = require('path')
const colors = require('colors')
const glob = require('glob-promise')

function copyArtifacts(targetDir, destDir) {
  return glob(path.join(targetDir, '/*.json')).then((files) => {
    let dirResult = fsPromises.mkdir(destDir).then(
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
      let newFile = path.join(destDir, path.basename(file))
      return fsPromises.copyFile(file, newFile).then(
        () => console.log('Copied artifact: ', base.green),
        (err) => console.error(`Couldn't copy artifact: ${base.red}`)
      )
    })

    return Promise.all(results)
  })
}

let keepArtifactsDir = path.dirname(
  require.resolve("@keep-network/keep-core/artifacts/KeepToken.json"))

let gnosisArtifactsDir = path.dirname(
  require.resolve("@gnosis.pm/safe-contracts/build/contracts/GnosisSafe.json"))

let localArtifacts = path.join(__dirname, '/artifacts/')

Promise.all([
  copyArtifacts(
    keepArtifactsDir,
    path.join(localArtifacts, '/keep-network/')
  ).then((v) => console.log('Successfully copied Keep contract artifacts!')),
  copyArtifacts(
    gnosisArtifactsDir,
    path.join(localArtifacts, '/gnosis/')
  ).then((v) => console.log('Successfully copied Gnosis contract artifacts!'))
]).then(
  (v) => v,
  (err) => console.error(
    'Error copying contract artifacts!',
    err.toString().red
  )
)
