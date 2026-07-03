import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCW3slt0r-STJr5-EKFLozoNx8wJEfyRUM",
  authDomain: "campustay-da4b5.firebaseapp.com",
  projectId: "campustay-da4b5",
  storageBucket: "campustay-da4b5.firebasestorage.app",
  messagingSenderId: "311068327323",
  appId: "1:311068327323:web:3e9ecbd42acedd39f1353e",
  measurementId: "G-D9ZH9Z7QMQ"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const db = getFirestore(app);
