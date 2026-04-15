var pc = null;

function updateSDP(sdp) {
    const lines = sdp.split('\r\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('m=video') === 0) {
            if (!lines[i + 1] || lines[i + 1].indexOf('b=AS:') !== 0) {
                lines.splice(i + 1, 0, 'b=AS:8000');
            } else {
                lines[i + 1] = 'b=AS:8000';
            }
            break;
        }
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('a=fmtp:') !== 0 || lines[i].indexOf('apt=') !== -1) {
            continue;
        }

        if (lines[i].indexOf('x-google-min-bitrate=') === -1) {
            lines[i] += ';x-google-min-bitrate=5000';
        }
        if (lines[i].indexOf('x-google-max-bitrate=') === -1) {
            lines[i] += ';x-google-max-bitrate=8000';
        }
        if (lines[i].indexOf('x-google-start-bitrate=') === -1) {
            lines[i] += ';x-google-start-bitrate=8000';
        }
    }

    return lines.join('\r\n');
}

function resolveAvatarId() {
    const avatarInput = document.getElementById('avatar');
    if (avatarInput && avatarInput.value.trim()) {
        return avatarInput.value.trim();
    }
    const urlAvatar = new URLSearchParams(window.location.search).get('avatar');
    if (urlAvatar) {
        return urlAvatar.trim();
    }
    return '';
}

function negotiate() {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    return pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
    }).then(() => {
        // wait for ICE gathering to complete
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(() => {
        var offer = pc.localDescription;
        const payload = {
            sdp: offer.sdp,
            type: offer.type,
        };
        const avatarId = resolveAvatarId();
        if (avatarId) {
            payload.avatar = avatarId;
        }
        return fetch('/offer', {
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then((response) => {
        return response.json();
    }).then((answer) => {
        document.getElementById('sessionid').value = answer.sessionid;
        answer.sdp = updateSDP(answer.sdp);
        return pc.setRemoteDescription(answer);
    }).catch((e) => {
        alert(e);
    });
}

function start() {
    var config = {
        sdpSemantics: 'unified-plan'
    };

    if (document.getElementById('use-stun').checked) {
        config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    }

    pc = new RTCPeerConnection(config);

    // connect audio / video
    pc.addEventListener('track', (evt) => {
        if (evt.track.kind == 'video') {
            document.getElementById('video').srcObject = evt.streams[0];
        } else {
            document.getElementById('audio').srcObject = evt.streams[0];
        }
    });

    document.getElementById('start').style.display = 'none';
    negotiate();
    document.getElementById('stop').style.display = 'inline-block';
}

function stop() {
    document.getElementById('stop').style.display = 'none';

    // close peer connection
    setTimeout(() => {
        pc.close();
    }, 500);
}

window.onunload = function(event) {
    // 在这里执行你想要的操作
    setTimeout(() => {
        pc.close();
    }, 500);
};

window.onbeforeunload = function (e) {
        setTimeout(() => {
                pc.close();
            }, 500);
        e = e || window.event
        // 兼容IE8和Firefox 4之前的版本
        if (e) {
          e.returnValue = '关闭提示'
        }
        // Chrome, Safari, Firefox 4+, Opera 12+ , IE 9+
        return '关闭提示'
      }
