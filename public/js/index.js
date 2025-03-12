/*
Zoom Video SDK Sample - WebRTC Mode
*/
let ZoomVideo
let client
let stream
let videoDecode
let videoEncode
let audioDecode
let audioEncode

////////////////////////////////////////////////////////////////////////
//
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById('user_name').value = "User" + Math.floor(Math.random() * 100)
  document.getElementById('join-button').addEventListener('click', joinSession)
  document.getElementById('leave-button').addEventListener('click', leaveSession)
  console.log('DOMContentLoaded')
})

////////////////////////////////////////////////////////////////////////
// TO BEGIN
// CREATE VIDEO SDK CLIENT
// INITIALIZE VIDEO SDK CLIENT
// ADD LISTENER THEN JOIN

async function joinSession() {

  //CREATE VIDEO SDK CLIENT
  ZoomVideo = window.WebVideoSDK.default
  client = ZoomVideo.createClient()

  //INITIALIZE VSDK CLIENT - Using WebRTC mode
  client.init('en-US', 'CDN', {
    enforceVirtualBackground: true,  // Enable this if not using SharedArrayBuffer
    // Enable WebRTC mode for video and audio
    videoOption: {
      webRTC: true
    },
    audioOption: {
      webRTC: true
    }
  })

  //LISTEN FOR CONNECTION STATUS
  client.on('connection-change', (payload) => {
   console.log("Connection Change: ", payload)
   if(payload.state == "Closed"){
     location.reload()
   }
  })

  //MEDIA ENCODER DECODER STATE
  client.on('media-sdk-change', (payload) => {
      console.log("media-sdk-change: " + JSON.stringify(payload))
      if (payload.type === 'video' && payload.result === 'success') {
        if (payload.action === 'encode') {
          // encode for sending video stream
          videoEncode = true
        } else if (payload.action === 'decode') {
          // decode for receiving video stream
          videoDecode = true
        }
      }
      if (payload.type === 'audio' && payload.result === 'success') {
        if (payload.action === 'encode') {
          // encode for sending audio stream (speak)
          audioEncode = true
        } else if (payload.action === 'decode') {
          // decode for receiving audio stream (hear)
          audioDecode = true
        }
      }
      if (payload.type === 'share' && payload.result === 'success') {
        if (payload.action === 'encode') {
          // encode for sending share stream
          shareEncode = true
        } else if (payload.action === 'decode') {
          // decode for receiving share stream
          shareDecode = true
        }
      }
  })

  //LISTEN TO FAREND VIDEO STATUS - UPDATED FOR WEBRTC MODE
  client.on('peer-video-state-change', (payload) => {
   console.log("peer-video-state-change: " + JSON.stringify(payload))
   // Get the current user's ID
   const selfId = client.getCurrentUserInfo()?.userId;
   
   if (payload.action === 'Start') {
     if (payload.userId === selfId) {
       console.log(`Self video state change: ${payload.userId}`)
       // Skip attachFarVideo for self video
     } else if(videoDecode) {
       attachFarVideo(stream, payload.userId, true)
     } else {
       console.log("wait until videoDecode gets enabled")
       waitForVideoDecoder(500, payload.userId)
     }
   } else if (payload.action === 'Stop') {
     if (payload.userId !== selfId) {
       attachFarVideo(stream, payload.userId, false)
     }
   }
  })

  // Added listener for dimension change
  client.on('video-dimension-change', payload => {
    console.log(payload)
  })

  //GET PARAMETERS AND JOIN VSDK SESSION
  let topic = document.getElementById('session_topic').value
  let userName = document.getElementById('user_name').value
  let password = document.getElementById('session_pwd').value
  let role = document.getElementById('join-role').elements["joinRole"].value

  // When generating JWT for the server, make sure to include:
  // video_webrtc_mode: true
  // audio_webrtc_mode: true
  let token = await getSignature(topic, role, password)
  console.log("topic: "+topic+", token: "+token+", userName: "+userName+", password: "+password);

  client.join(topic, token, userName, password).then(() => {
    stream = client.getMediaStream();
    var n = client.getCurrentUserInfo();
    var m = client.getSessionInfo();
    var sessionId = m.sessionId;
    console.log("getCurrentUserInfo: ", n);
    console.log("get Session ID: ", sessionId);
    console.log("Connection Success");
    
    // Check for existing participants with video on (except self)
    client.getAllUser().forEach((user) => {
      if (user.bVideoOn && user.userId !== n.userId) {
        attachFarVideo(stream, user.userId, true);
      }
    });
    
    cameraStartStop(); // automatically unmute camera when join
    audioStart(); // automatically start audio
  }).catch((error) => {
    console.log(error)
  })
}

//LEAVE OR END SESSION
function leaveSession() {
  var n = client.getCurrentUserInfo()
  console.log("isHost: " + n.isHost)
  if(n.isHost){
    client.leave(true)
  }else{
    client.leave()
  }
}

//AUDIO START
async function audioStart() {
  try{
    await stream.startAudio()
    console.log(`${new Date().toISOString()} audioStart`)
  } catch (e){
    console.log(e)
  }
}

//LOCAL CAMERA START STOP
async function cameraStartStop() {
  let isVideoOn = await stream.isCapturingVideo()
  console.log(new Date().toISOString() + " cameraStartStop isCapturingVideo: " + isVideoOn)
  let localVideoTrack = ZoomVideo.createLocalVideoTrack() // USED FOR RENDERING SELF_VIDEO WITH VIDEO TAG
  var n = client.getCurrentUserInfo()
  console.log("getCurrentUserInfo: ", n)

  var selfId = n.userId
  console.log("selfId: ", selfId)

  if(!isVideoOn){
    toggleSelfVideo(stream, localVideoTrack, selfId, true)
  }else{
    toggleSelfVideo(stream, localVideoTrack, selfId, false)
  }
}

//VIDEO TAG MODE TOGGLE NEAR END VIDEO ON VIDEO TAG
const toggleSelfVideo = async (mediaStream, localVideoTrack, userId, isVideoOn) => {
    let selfVideo = document.getElementById('self-video-videotag')
    if (isVideoOn) {
        console.log(new Date().toISOString() + " toggleSelfVideo start")
        try {
            // For WebRTC mode, render self video
            // Use localVideoTrack to render directly to video element
            await localVideoTrack.start(selfVideo)
            
            // Start video stream (HD True to fix capture resolution at 720p)
            await stream.startVideo({videoElement: selfVideo, hd: true})
            
            isVideoOn = true
            console.log(new Date().toISOString() + " Near end video rendering started.")
        } catch (error) {
            console.error("Failed to start self video:", error)
        }
    } else {
        console.log("toggleSelfVideo stop")
        try {
            await localVideoTrack.stop()
            await stream.stopVideo()
            isVideoOn = false
        } catch (error) {
            console.error("Failed to stop self video:", error)
        }
    }
}

// ATTACH/DETACH FAR END VIDEO USING WEBRTC MODE
const attachFarVideo = async (mediaStream, userId, isVideoOn) => {
    // Get the current user's ID
    const selfId = client.getCurrentUserInfo().userId;
    
    // Skip processing for self video
    if (userId === selfId) {
        console.log(`${userId} is the user's own ID, skipping attachVideo.`)
        return; // Self video is handled by toggleSelfVideo
    }
    
    // Make sure we have a container for video players
    let videoContainer = document.querySelector('video-player-container')
    if (!videoContainer) {
        videoContainer = document.createElement('video-player-container')
        document.querySelector('#buttons-and-canvas').appendChild(videoContainer)
        
        // Add CSS style for video players
        const style = document.createElement('style')
        style.textContent = `
            video-player-container {
                display: flex;
                flex-wrap: wrap;
                width: 100%;
                height: auto;
                gap: 10px;
                margin-top: 10px;
            }
            video-player {
                width: 25%;
                height: auto;
                min-width: 320px;
                aspect-ratio: 16/9;
                background-color: gray;
                border-radius: 10px;
                overflow: hidden;
            }
            video-player video {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
        `
        document.head.appendChild(style)
    }
    
    if (isVideoOn) {
        // Check if we can support multiple videos
        if (!stream.isSupportMultipleVideos()) {
            console.log("Multiple video support is not available, using active speaker view")
            // Clean up any existing remote videos in the container
            Array.from(videoContainer.children).forEach(child => {
                videoContainer.removeChild(child)
            })
        }
        
        // Remove existing video element for this user if it exists
        const existingVideo = videoContainer.querySelector(`[data-user-id="${userId}"]`)
        if (existingVideo) {
            videoContainer.removeChild(existingVideo)
        }
        
        // Attach video with WebRTC mode - quality 3 is 720p
        await mediaStream.attachVideo(userId, 3).then((userVideo) => {
            // Add attribute to identify this video element
            userVideo.setAttribute('data-user-id', userId)
            videoContainer.appendChild(userVideo)
            console.log(new Date().toISOString() + ` ${userId} video attached with WebRTC.`)
        }).catch(error => {
            console.error("Failed to attach video:", error)
        })
    } else {
        // Detach video
        await mediaStream.detachVideo(userId)
        
        // Remove the video element from DOM
        const videoElement = videoContainer.querySelector(`[data-user-id="${userId}"]`)
        if (videoElement) {
            videoContainer.removeChild(videoElement)
        }
        
        console.log(new Date().toISOString() + ` ${userId} video detached.`)
    }
}

////////////////////////////////////////////////////////////////////////
// WAIT FOR DECODERS

//WAIT FOR VIDEO DECODER
async function waitForVideoDecoder(ms, userid){
    // Get the current user's ID
    const selfId = client.getCurrentUserInfo()?.userId;
    
    // Skip processing for self video
    if (userid === selfId) {
        console.log(`Skipping attachVideo for self video (${userid}).`)
        return;
    }
    
    let len = 10
    for (let i = 0; i < len; i++) {
        await sleep(ms)
        console.log("waiting for video decoder: " + i)
        if(videoDecode){
            attachFarVideo(stream, userid, true)
            break
        }
    }
}

//WAIT FOR AUDIO DECODER
async function waitForAudioDecoder(ms){
    let len = 10
    for (let i = 0; i < len; i++) {
        await sleep(ms)
        console.log("Trying to wait for audio decoder: " + i)
        if(audioDecode){
            console.log("audioStart ready.")
            audioStart();
            break
        }
    }
}

//SLEEP(WAIT)
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

////////////////////////////////////////////////////////////////////////
// GET SIGNATURE FOR VSDK FOR WEB
function getSignature(topic, role, password) {
    return new Promise(function (resolve, reject) {
        let xhr = new XMLHttpRequest()
        console.log("location.hostname: " + location.hostname)
        xhr.open('POST', './', true)
        xhr.setRequestHeader('content-type', 'application/json')
        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                const obj = JSON.parse(xhr.response)
                console.log("getSignature: " + xhr.response)
                resolve(obj.signature)
            } else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                })
            }
        }
        xhr.onerror = function () {
            reject({
                status: this.status,
                statusText: xhr.statusText
            })
        }
        const body = JSON.parse('{}')
        body["topic"] = topic
        body["role"] = parseInt(role)
        body["password"] = password
        // Note: Make sure your server includes video_webrtc_mode: true and audio_webrtc_mode: true in the JWT
        console.log("sending JSON request with this body: " + JSON.stringify(body))
        xhr.send(JSON.stringify(body))
    })
}