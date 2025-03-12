const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const KJUR = require('jsrsasign')

const app = express()
const port = process.env.PORT || 8080;
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

// SABを使用しないWebRTCモードでは、以下のヘッダー設定は不要なので削除
// app.use(function(req, res, next) {
//   res.header("Cross-Origin-Embedder-Policy", "require-corp")
//   res.header("Cross-Origin-Opener-Policy", "same-origin")
//   next()
// })

app.use(express.static(path.join(__dirname, 'public')))
app.use(bodyParser.json(), cors())

app.post('/', (req, res) => {
  const iat = Math.floor(new Date().getTime() / 1000)
  const exp = iat + 60 * 60 * 2

  const oHeader = { alg: 'HS256', typ: 'JWT' }
  const oPayload = {
    app_key: process.env.ZOOM_VSDK_KEY,
    tpc: req.body.topic,
    role_type: req.body.role,
    pwd: req.body.password,
    version: 1,
    iat: iat,
    exp: exp,
    video_webrtc_mode: 1,  // WebRTCモードを有効化
    audio_webrtc_mode: 1,  // WebRTCモードを有効化
  }
  const sHeader = JSON.stringify(oHeader)
  const sPayload = JSON.stringify(oPayload)
  const signature = KJUR.jws.JWS.sign('HS256', sHeader, sPayload, process.env.ZOOM_VSDK_SECRET)
  res.json({
    signature: signature
  })
})

app.listen(port, () => console.log(`Zoom Video SDK for Web Sample. port: ${port}! Open http://localhost:${port} with your browser.`))