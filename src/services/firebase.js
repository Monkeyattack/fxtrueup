import admin from 'firebase-admin';
import { logger } from '../utils/logger.js';

class FirebaseService {
  constructor() {
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;

    try {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      this.db = admin.firestore();
      this.auth = admin.auth();
      this.initialized = true;

      logger.info('Firebase initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Firebase:', error);
      throw error;
    }
  }

  getDb() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.db;
  }

  getAuth() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.auth;
  }
}

const firebaseService = new FirebaseService();
firebaseService.initialize();

export const db = firebaseService.getDb();
export const auth = firebaseService.getAuth();
export default firebaseService;