type LookDirection = 'forward' | 'left' | 'right' | 'up' | 'down' | 'no_face'

export type LookAwayResult = {
  direction: LookDirection
  yaw: number
  pitch: number
  confidence: number
}

type FaceMeshLike = {
  onResults: (cb: (res: any) => void) => void
  send: (input: { image: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement }) => Promise<void>
  setOptions: (opts: Record<string, any>) => void
}

type DetectableElement = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement

let faceMeshPromise: Promise<FaceMeshLike> | null = null
let inflight: Promise<LookAwayResult> | null = null
let pendingResolve: ((value: LookAwayResult) => void) | null = null

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = dataUrl
  })
}

async function getFaceMesh(): Promise<FaceMeshLike> {
  if (!faceMeshPromise) {
    faceMeshPromise = (async () => {
      const mod: any = await import('@mediapipe/face_mesh')

      // CDN asset loading for mediapipe wasm
      const fm: FaceMeshLike = new mod.FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      })

      fm.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      })

      fm.onResults((results: any) => {
        if (!pendingResolve) return
        const resolve = pendingResolve
        pendingResolve = null

        const faces = results?.multiFaceLandmarks
        if (!Array.isArray(faces) || faces.length === 0) {
          resolve({ direction: 'no_face', yaw: 0, pitch: 0, confidence: 0 })
          return
        }

        const lm = faces[0]
        // MediaPipe FaceMesh landmark indices (common stable points)
        // 1: nose tip, 33: left eye outer, 263: right eye outer, 61: mouth left, 291: mouth right
        const nose = lm?.[1]
        const leftEye = lm?.[33]
        const rightEye = lm?.[263]
        const mouthL = lm?.[61]
        const mouthR = lm?.[291]

        if (!nose || !leftEye || !rightEye) {
          resolve({ direction: 'no_face', yaw: 0, pitch: 0, confidence: 0 })
          return
        }

        const midEyeX = (leftEye.x + rightEye.x) / 2
        const midEyeY = (leftEye.y + rightEye.y) / 2

        const eyeDist = Math.max(1e-6, Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y))

        // Normalize by eye distance so it scales with face size.
        const yaw = (nose.x - midEyeX) / eyeDist

        // Pitch: use nose relative to eye line; fallback to mouth line if available.
        const mouthY = mouthL && mouthR ? (mouthL.y + mouthR.y) / 2 : null
        const pitchBaseY = mouthY ?? midEyeY
        const pitch = (nose.y - pitchBaseY) / eyeDist

        // Heuristic mapping; tuned to be conservative.
        let direction: LookDirection = 'forward'
        if (yaw > 0.22) direction = 'right'
        else if (yaw < -0.22) direction = 'left'
        else if (pitch > 0.35) direction = 'down'
        else if (pitch < -0.25) direction = 'up'

        const confidence = 1
        resolve({ direction, yaw, pitch, confidence })
      })

      return fm
    })()
  }

  return faceMeshPromise
}

export async function detectLookAway(dataUrl: string): Promise<LookAwayResult> {
  const img = await loadImage(dataUrl)
  return detectLookAwayFromElement(img)
}

export async function detectLookAwayFromElement(el: DetectableElement): Promise<LookAwayResult> {
  // Serialize calls: FaceMesh isn't safe for concurrent sends.
  if (inflight) {
    try {
      await inflight
    } catch {
      // ignore
    }
  }

  inflight = (async () => {
    const faceMesh = await getFaceMesh()

    const resultPromise = new Promise<LookAwayResult>((resolve) => {
      pendingResolve = resolve
    })

    const timeoutPromise = new Promise<LookAwayResult>((_, reject) =>
      setTimeout(() => reject(new Error('lookaway-timeout')), 5000)
    )

    await faceMesh.send({ image: el })
    return Promise.race([resultPromise, timeoutPromise]).catch(() => {
      pendingResolve = null
      return { direction: 'no_face' as LookDirection, yaw: 0, pitch: 0, confidence: 0 }
    })
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}
