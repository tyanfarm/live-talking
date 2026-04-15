# MuseTalk Setup Guide For This Repo

> Target: LiveTalking + MuseTalk on RTX 5080 Blackwell
> Tested install baseline: Python 3.10, PyTorch 2.9.1, CUDA 12.8

This file is for the LiveTalking repo, not standalone MuseTalk.

The correct flow here is:

1. Install Python + CUDA dependencies
2. Build the MM stack (`mmcv`, `mmdet`, `mmpose`)
3. Put MuseTalk weights under `./models`
4. Build one avatar from your source video
5. Run `app.py` with `--model musetalk`
6. Open the WebRTC page and inject your test audio through `/humanaudio`

If you only want to measure streaming latency for a 5s video and an 11s audio clip, use `webrtc` first. RTMP adds extra buffering and is not the right baseline for low-latency testing.

## 1. Create Virtual Environment

```sh
python3 -m venv venv
source venv/bin/activate
export UV_HTTP_TIMEOUT=300
```

## 2. Install System Dependencies

```sh
sudo apt-get update
sudo apt-get install -y git ffmpeg wget curl unzip build-essential python3.10-dev \
    libglib2.0-0 libsm6 libxext6 libxrender1 libsndfile1

ffmpeg -version
```

## 3. Upgrade pip and Install PyTorch

```sh
uv pip install --upgrade pip wheel
python --version && pip --version

uv pip install torch==2.9.1 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128

python -c 'import torch; print(f"PyTorch: {torch.__version__}"); print(f"CUDA available: {torch.cuda.is_available()}"); print(f"CUDA device: {torch.cuda.get_device_name(0)}")'
```

## 4. Install Repo Python Requirements

The repo `requirements.txt` does not pin `numpy`, so force `numpy<2` up front.

```sh
uv pip install "numpy<2"
uv pip install -r requirements.txt
```

## 5. Install MM Packages

Prebuilt `mmcv` wheels are not available for this stack, so build from source.

```sh
uv pip install "setuptools<70" ninja Cython
uv pip install --no-cache-dir -U openmim

mim install mmengine
MAX_JOBS=4 MMCV_WITH_OPS=1 FORCE_CUDA=1 pip install mmcv==2.1.0 --no-cache-dir --no-build-isolation
mim install "mmdet==3.1.0"
mim install "mmpose==1.1.0"
```

``` sh
pip install "numpy<2" "opencv-python==4.9.0.80"
```

Patch `mmdet` version validation:

```sh
sed -i "s/mmcv_maximum_version = '2.1.0'/mmcv_maximum_version = '2.2.0'/" \
    venv/lib/python3.10/site-packages/mmdet/__init__.py
```

Verify:

```sh
python -c 'import mmcv; print("mmcv:", mmcv.__version__); import mmdet; print("mmdet:", mmdet.__version__); import mmpose; print("mmpose:", mmpose.__version__); print("All OK")'
```

## 6. Optional Compatibility Fix

If `chumpy` fails later:

```sh
pip install --no-build-isolation chumpy
```

## 7. Put Model Weights In `./models`

This repo does not use standalone MuseTalk scripts like `download_weights.sh` or `inference.sh`.

At runtime, LiveTalking loads:

- `models/musetalkV15/unet.pth`
- `models/musetalkV15/musetalk.json`
- `models/sd-vae/*`
- `models/whisper/*`
- `models/dwpose/dw-ll_ucoco_384.pth`
- `models/face-parse-bisent/79999_iter.pth`
- `models/face-parse-bisent/resnet18-5c106cde.pth`

The runtime paths are defined in:

- `avatars/musetalk/utils/utils.py`
- `avatars/musetalk_avatar.py`
- `avatars/musetalk/utils/preprocessing.py`

Quick check:

```sh
ls models/musetalkV15/unet.pth
ls models/musetalkV15/musetalk.json
ls models/whisper/pytorch_model.bin
ls models/dwpose/dw-ll_ucoco_384.pth
ls models/face-parse-bisent/79999_iter.pth
ls models/face-parse-bisent/resnet18-5c106cde.pth
ls models/sd-vae/diffusion_pytorch_model.bin
```

## 8. Step-By-Step Test Flow

This is the shortest path for your exact use case:

1. Prepare a 5s neutral source video
2. Run `genavatar` to build `data/avatars/<avatar_id>`
3. Start LiveTalking with `--model musetalk`
4. Open `webrtcapi.html` and click `Start`
5. Read the generated `sessionid`
6. Upload your 11s local WAV to `/humanaudio`

The detailed commands are below.

## 9. Prepare Your 5s Source Video

MuseTalk in this repo needs an avatar directory under `data/avatars/<avatar_id>`.
Build it from your source video with `avatars/musetalk/genavatar.py`.

It is safest to normalize the source video to 25 fps first:

```sh
mkdir -p data/test_inputs
ffmpeg -y -i /path/to/input_5s.mp4 -an -vf "fps=25" data/test_inputs/{file_name}.mp4
```

Generate the avatar:

```sh
python -m avatars.musetalk.genavatar \
  --file data/test_inputs/{file_name}.mp4 \
  --avatar_id {avatar_id} \
  --version v15 \
  --gpu_id 0 \
  --bbox_shift 0 \
  --extra_margin 10 \
  --parsing_mode jaw
```

This creates:

- `data/avatars/{avatar_id}/full_imgs`
- `data/avatars/{avatar_id}/mask`
- `data/avatars/{avatar_id}/coords.pkl`
- `data/avatars/{avatar_id}/mask_coords.pkl`
- `data/avatars/{avatar_id}/latents.pt`

## 10. Create The Avatar With `genavatar`

Run `genavatar` from the repo root in module mode:

```sh
python -m avatars.musetalk.genavatar \
  --file data/test_inputs/{file_name}.mp4 \
  --avatar_id {avatar_id} \
  --version v15 \
  --gpu_id 0 \
  --bbox_shift 0 \
  --extra_margin 10 \
  --parsing_mode jaw
```

Verify the generated files:

```sh
find data/avatars/{avatar_id} -maxdepth 2 -type f | sort
```

You need to see at least:

- `data/avatars/{avatar_id}/latents.pt`
- `data/avatars/{avatar_id}/coords.pkl`
- `data/avatars/{avatar_id}/mask_coords.pkl`

If `latents.pt` is missing, do not continue. `app.py` will fail to load the avatar.

## 11. Prepare Your 11s Test Audio

`/humanaudio` accepts file upload and the server resamples it internally, but WAV is the least fragile choice.

```sh
ffmpeg -y -i /path/to/input_11s_audio.wav -ac 1 -ar 16000 data/test_inputs/audio_11s.wav
```

## 12. Start LiveTalking With MuseTalk

For latency testing, use smaller batches first. `--batch_size 4` is a better low-latency starting point than the default `16`.

```sh
python app.py \
  --transport webrtc \
  --model musetalk \
  --avatar_id musetalk_test_5s \
  --batch_size 4 \
  --listenport 8010
```

Open:

```text
http://127.0.0.1:8010/webrtcapi.html
```

Click `Start` first. The WebRTC session is created only after that.

## 13. Get The `sessionid`

After clicking `Start`, get the generated `sessionid` from one of these places:

Browser console:

```js
document.getElementById('sessionid').value
```

Network tab:

- open DevTools
- click the `/offer` request
- read the `sessionid` in the JSON response

If the value is still `0`, the WebRTC session was not created successfully.

## 14. Upload The 11s Audio To `/humanaudio`

This page does not provide an audio upload button. Use `curl`:

```sh
curl -X POST http://127.0.0.1:8010/humanaudio \
  -F "sessionid=<SESSION_ID>" \
  -F "file=@data/test_inputs/audio_11s.wav"
```

You should now see the MuseTalk avatar stream in the browser and start speaking with the uploaded audio.

You can also upload from the browser console:

```js
const sessionid = document.getElementById('sessionid').value;
const input = document.createElement('input');
input.type = 'file';
input.accept = 'audio/*';
input.onchange = async () => {
  const fd = new FormData();
  fd.append('sessionid', sessionid);
  fd.append('file', input.files[0]);
  const res = await fetch('/humanaudio', { method: 'POST', body: fd });
  console.log(await res.text());
};
input.click();
```

## 15. Optional: Stop Current Speech Immediately

If the avatar is already speaking and you want to interrupt it:

```sh
curl -X POST http://127.0.0.1:8010/interrupt_talk \
  -H 'Content-Type: application/json' \
  -d '{"sessionid":"<SESSION_ID>"}'
```

## 16. Notes For Latency Testing

- Use `webrtc`, not `rtmp`, for the first latency test.
- Lower `--batch_size` reduces first-frame latency.
- Default `--fps` is 25 and should stay at 25.
- This repo ingests audio in 20 ms chunks, so startup latency is affected by:
  - audio buffering
  - ASR feature windowing
  - `batch_size`
  - browser WebRTC playout buffering

Practical starting points:

- Lowest latency test: `--batch_size 4`
- More stable throughput: `--batch_size 8`
- Throughput-focused: `--batch_size 16`

## 17. Useful Runtime Signals

When audio is uploaded, these runtime signals matter:

- speaking state transitions in server logs
- average inference FPS in server logs
- subjective delay between `curl` upload time and first mouth movement in browser

If you want a rough upload-side timing:

```sh
time curl -X POST http://127.0.0.1:8010/humanaudio \
  -F "sessionid=<SESSION_ID>" \
  -F "file=@data/test_inputs/audio_11s.wav"
```

That is not end-to-end latency, but it helps separate API upload time from render delay.

## Troubleshooting

### `_ARRAY_API not found` or `numpy.core.multiarray failed to import`

```sh
pip install "numpy<2"
```

### `ModuleNotFoundError: No module named 'pkg_resources'`

```sh
pip install "setuptools<70"
```

### `c++: fatal error: Killed signal terminated program cc1plus`

Lower the MM build parallelism:

```sh
MAX_JOBS=2 MMCV_WITH_OPS=1 FORCE_CUDA=1 pip install mmcv==2.1.0 --no-cache-dir --no-build-isolation
```

### `MMCV==2.1.0 is used but incompatible`

Patch `mmdet`:

```sh
sed -i "s/mmcv_maximum_version = '2.1.0'/mmcv_maximum_version = '2.2.0'/" \
    venv/lib/python3.10/site-packages/mmdet/__init__.py
```

### Audio uploads fail or decode poorly

Convert the file to mono 16 kHz WAV before uploading:

```sh
ffmpeg -y -i input_audio.ext -ac 1 -ar 16000 test.wav
```
