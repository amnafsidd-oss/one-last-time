import 'dotenv/config';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

/**
 * Authentication middleware
 * Extracts Bearer token from Authorization header and validates against PocketBase
 * Sets req.auth with authenticated user data or null if invalid/missing
 * Does NOT block requests - lets routes decide if auth is required
 */
export async function authMiddleware(req, res, next) {
  // ============================================
  // STEP 1: Log middleware start
  // ============================================
  logger.info('[AUTH MIDDLEWARE] Starting auth check');
  logger.info(`[AUTH MIDDLEWARE] Request: ${req.method} ${req.path}`);

  // ============================================
  // STEP 2: Check Authorization header
  // ============================================
  const authHeader = req.headers.authorization;
  logger.info('[AUTH MIDDLEWARE] Authorization header: ' + (authHeader || 'MISSING'));

  // Initialize req.auth as null
  req.auth = null;

  // If no Authorization header, continue without auth
  if (!authHeader) {
    logger.info('[AUTH MIDDLEWARE] No Authorization header - continuing without authentication');
    logger.info('[AUTH MIDDLEWARE] Final req.auth: ' + JSON.stringify(req.auth || 'UNDEFINED'));
    return next();
  }

  // ============================================
  // STEP 3: Extract Bearer token
  // ============================================
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn('[AUTH MIDDLEWARE] Invalid Authorization header format - expected "Bearer {token}"');
    logger.warn(`[AUTH MIDDLEWARE] Received format: "${parts[0]} ..." (parts count: ${parts.length})`);
    logger.info('[AUTH MIDDLEWARE] Final req.auth: ' + JSON.stringify(req.auth || 'UNDEFINED'));
    return next();
  }

  const token = parts[1];
  logger.info('[AUTH MIDDLEWARE] Token extracted: ' + (token ? 'YES - ' + token.substring(0, 20) + '...' : 'NO'));
  logger.debug(`[AUTH MIDDLEWARE] Full token length: ${token.length} characters`);

  // ============================================
  // STEP 4: Validate token against PocketBase
  // ============================================
  try {
    logger.info('[AUTH MIDDLEWARE] Validating token against PocketBase...');
    logger.debug(`[AUTH MIDDLEWARE] PocketBase URL: ${pb.baseUrl}`);

    // Load the saved auth state with the provided token
    pb.authStore.save(token);
    logger.debug('[AUTH MIDDLEWARE] Token saved to authStore');

    // ============================================
    // STEP 5: Check PocketBase auth store state
    // ============================================
    logger.info('[AUTH MIDDLEWARE] PocketBase authStore.isValid: ' + pb.authStore.isValid + ', authStore.token: ' + (pb.authStore.token ? 'EXISTS' : 'MISSING'));
    logger.debug(`[AUTH MIDDLEWARE] authStore.token length: ${pb.authStore.token ? pb.authStore.token.length : 0}`);

    // Check if the token is valid
    if (!pb.authStore.isValid) {
      logger.warn('[AUTH MIDDLEWARE] Token validation failed - token is invalid or expired');
      pb.authStore.clear();
      logger.debug('[AUTH MIDDLEWARE] authStore cleared');
      logger.info('[AUTH MIDDLEWARE] Final req.auth: ' + JSON.stringify(req.auth || 'UNDEFINED'));
      return next();
    }

    // Get the authenticated user from authStore
    const authData = pb.authStore.record;
    logger.debug(`[AUTH MIDDLEWARE] authStore.record exists: ${!!authData}`);

    if (!authData || !authData.id) {
      logger.warn('[AUTH MIDDLEWARE] Token validation failed - no user data in auth store');
      logger.debug(`[AUTH MIDDLEWARE] authData: ${JSON.stringify(authData || 'NULL')}`);
      pb.authStore.clear();
      logger.debug('[AUTH MIDDLEWARE] authStore cleared');
      logger.info('[AUTH MIDDLEWARE] Final req.auth: ' + JSON.stringify(req.auth || 'UNDEFINED'));
      return next();
    }

    // ============================================
    // STEP 6: Set req.auth with user data
    // ============================================
    req.auth = {
      id: authData.id,
      email: authData.email,
      username: authData.username,
      verified: authData.verified,
      record: authData,
    };

    logger.info('[AUTH MIDDLEWARE] ✓ Token validated successfully');
    logger.info(`[AUTH MIDDLEWARE] User ID: ${authData.id}`);
    logger.info(`[AUTH MIDDLEWARE] User email: ${authData.email}`);
    logger.info(`[AUTH MIDDLEWARE] User username: ${authData.username}`);
    logger.info(`[AUTH MIDDLEWARE] User verified: ${authData.verified}`);
    logger.info('[AUTH MIDDLEWARE] Final req.auth: ' + JSON.stringify(req.auth || 'UNDEFINED'));

    return next();
  } catch (error) {
    logger.error(`[AUTH MIDDLEWARE] Token validation error: ${error.message}`);
    logger.error(`[AUTH MIDDLEWARE] Error type: ${error.constructor.name}`);
    logger.debug(`[AUTH MIDDLEWARE] Error stack: ${error.stack}`);
    pb.authStore.clear();
    logger.debug('[AUTH MIDDLEWARE] authStore cleared due to error');
    logger.info('[AUTH MIDDLEWARE] Final req.auth: ' + JSON.stringify(req.auth || 'UNDEFINED'));
    return next();
  }
}

export default authMiddleware;