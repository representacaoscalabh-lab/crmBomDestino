import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyBWcelEdDWqwD6plUIhZOVc-tcr6z9AEPY',
  authDomain: 'wrrjbomdestino.firebaseapp.com',
  projectId: 'wrrjbomdestino',
  storageBucket: 'wrrjbomdestino.firebasestorage.app',
  messagingSenderId: '101035843941',
  appId: '1:101035843941:web:d81c1a305f72ae97c5418c',
  measurementId: 'G-Y10G0HW30W',
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
