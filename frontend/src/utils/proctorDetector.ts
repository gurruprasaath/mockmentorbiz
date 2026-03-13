import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-webgl'

type DetectionCounts = {
  personCount: number
  phoneCount: number
}

type DetectableElement = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement

let modelPromise: Promise<any> | null = null
let tfReadyPromise: Promise<void> | null = null

async function ensureTfReady() {
  if (!tfReadyPromise) {
    tfReadyPromise = (async () => {
      try {
        await tf.setBackend('webgl')
      } catch {
        // fallback to default backend
      }
      await tf.ready()
    })()
  }
  return tfReadyPromise
}

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await ensureTfReady()
      const m: any = await import('@tensorflow-models/coco-ssd')
      // Use the faster base model to reduce detection latency.
      return m.load({ base: 'lite_mobilenet_v2' })
    })()
  }
  return modelPromise
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = dataUrl
  })
}

export async function detectPeopleAndPhones(dataUrl: string): Promise<DetectionCounts> {
  const model = await getModel()
  const img = await loadImage(dataUrl)

  // detect(img, maxNumBoxes?, minScore?)
  const predictions: Array<{ class: string; score: number }> = await model.detect(img, 30, 0.05)

  const personCount = predictions.filter((p) => p.class === 'person' && (p?.score ?? 0) >= 0.35).length
  const phoneCount = predictions.filter((p) => p.class === 'cell phone' && (p?.score ?? 0) >= 0.15).length

  return { personCount, phoneCount }
}

export async function detectPeopleAndPhonesFromElement(el: DetectableElement): Promise<DetectionCounts> {
  const model = await getModel()

  // detect(input, maxNumBoxes?, minScore?)
  const predictions: Array<{ class: string; score: number }> = await model.detect(el, 30, 0.05)

  const personCount = predictions.filter((p) => p.class === 'person' && (p?.score ?? 0) >= 0.35).length
  const phoneCount = predictions.filter((p) => p.class === 'cell phone' && (p?.score ?? 0) >= 0.15).length

  return { personCount, phoneCount }
}
