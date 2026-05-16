import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const PAYFAST_SECURED_KEY = process.env.PAYFAST_SECURED_KEY;
const PAYFAST_TOKEN_URL =
  'https://ipguat.apps.net.pk/Ecommerce/api/Transaction/GetAccessToken';

logger.info(`PayFast Merchant ID: ${PAYFAST_MERCHANT_ID}`);

router.post('/create-payment', async (req, res) => {
  try {
    logger.info('[PAYFAST] ===== CREATE PAYMENT START =====');

    logger.info(
      `[PAYFAST] Request body: ${JSON.stringify(req.body)}`
    );

    const {
      ad_id,
      amount,
      duration,
      customer_email,
      customer_name,
      success_url,
      failure_url,
    } = req.body;

    // ============================================
    // VALIDATION
    // ============================================

    if (!ad_id) {
      return res.status(400).json({
        error: 'ad_id is required',
      });
    }

    if (!amount) {
      return res.status(400).json({
        error: 'amount is required',
      });
    }

    if (!duration) {
      return res.status(400).json({
        error: 'duration is required',
      });
    }

    if (!customer_email) {
      return res.status(400).json({
        error: 'customer_email is required',
      });
    }

    if (!customer_name) {
      return res.status(400).json({
        error: 'customer_name is required',
      });
    }

    if (!success_url) {
      return res.status(400).json({
        error: 'success_url is required',
      });
    }

    if (!failure_url) {
      return res.status(400).json({
        error: 'failure_url is required',
      });
    }

    const numAmount = Number(amount);
    const numDuration = Number(duration);

    // ============================================
    // FIND USER
    // ============================================

    let userRecord;

    try {
      userRecord = await pb
        .collection('users')
        .getFirstListItem(
          `email="${customer_email.trim()}"`
        );

      logger.info(
        `[PAYFAST] Found user: ${userRecord.id}`
      );

    } catch (error) {

      console.error(
        '[PAYFAST] USER LOOKUP FAILED'
      );

      console.error(error);

      return res.status(400).json({
        error: 'Could not find user by email',
        details:
          error.response ||
          error.data ||
          error.message,
      });
    }

    // ============================================
    // CREATE ORDER ID
    // ============================================

    const order_id = `ad_${ad_id}_${Date.now()}`;

    // ============================================
    // PAYMENT RECORD
    // ============================================

    const pbRecordData = {
      ad_id: ad_id,

      user_id: userRecord.id,

      order_id: order_id,
      m_payment_id: order_id,

      amount: numAmount,
      duration: numDuration,

      customer_email: customer_email.trim(),
      customer_name: customer_name.trim(),

      status: 'pending',
    };

    console.log(
      'Creating PocketBase payment with:',
      pbRecordData
    );

    let paymentRecord;

    try {

      paymentRecord = await pb
        .collection('payments')
        .create(pbRecordData);

      console.log(
        'Payment created:',
        paymentRecord
      );

    } catch (error) {

      console.error(
        'PocketBase payment create failed'
      );

      console.error(error);

      console.error(
        JSON.stringify(
          error.response ||
            error.data ||
            error,
          null,
          2
        )
      );

      return res.status(400).json({
        error:
          'Failed to create payment record',
        details:
          error.response ||
          error.data ||
          error.message,
      });
    }

    // ============================================
    // GET ACCESS TOKEN
    // ============================================

    const tokenPayload =
      new URLSearchParams();

    tokenPayload.append(
      'MERCHANT_ID',
      PAYFAST_MERCHANT_ID
    );

    tokenPayload.append(
      'SECURED_KEY',
      PAYFAST_SECURED_KEY
    );

    tokenPayload.append(
      'BASKET_ID',
      order_id
    );

    tokenPayload.append(
      'TXNAMT',
      numAmount.toFixed(2)
    );

    tokenPayload.append(
      'CURRENCY_CODE',
      'PKR'
    );

    logger.info(
      '[PAYFAST] Requesting access token'
    );

    const tokenResponse = await fetch(
      PAYFAST_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body: tokenPayload.toString(),
      }
    );

    const tokenText =
      await tokenResponse.text();

    logger.info(
      `[PAYFAST] Token response: ${tokenText}`
    );

    if (!tokenResponse.ok) {
      return res.status(400).json({
        error:
          'Failed to get PayFast access token',
        details: tokenText,
      });
    }

    // ============================================
    // EXTRACT TOKEN FROM RESPONSE
    // ============================================

    let accessToken;
    try {
      // Try parsing as JSON first
      const tokenJson = JSON.parse(tokenText);
      accessToken =
  tokenJson.ACCESS_TOKEN ||
  tokenJson.TOKEN ||
  tokenJson.access_token ||
  tokenJson.token;
    } catch (e) {
      // If not JSON, try to extract TOKEN field from response
      const tokenMatch = tokenText.match(/TOKEN[=:"\s]+([^\s,}"]+)/);
      accessToken = tokenMatch ? tokenMatch[1] : tokenText;
    }

    if (!accessToken) {
      logger.error('[PAYFAST] Failed to extract TOKEN from response');
      return res.status(400).json({
        error: 'Failed to extract TOKEN from PayFast response',
        details: tokenText,
      });
    }

    logger.info(`[PAYFAST] Extracted TOKEN: ${accessToken}`);

    // ============================================
    // GENERATE MD5 SIGNATURE
    // ============================================

    const MERCHANT_NAME = 'Classified Ads';
    const PROCCODE = 'ECOMM';
    const VERSION = '1.1';
    const TXNDESC = 'Feature Ad';
    const ORDER_DATE = new Date().toISOString();

    const signatureString = [
      PAYFAST_MERCHANT_ID,
      MERCHANT_NAME,
      accessToken,
      PROCCODE,
      numAmount.toFixed(2),
      '00000000000', // CUSTOMER_MOBILE_NO
      customer_email.trim(),
      VERSION,
      TXNDESC,
      success_url.trim(),
      failure_url.trim(),
      order_id,
      ORDER_DATE,
      'PKR',
      PAYFAST_SECURED_KEY,
    ].join('');

    logger.info(`[PAYFAST] Signature string: ${signatureString}`);

    const signature = crypto
      .createHash('md5')
      .update(signatureString)
      .digest('hex');

    logger.info(`[PAYFAST] Generated signature: ${signature}`);

    // ============================================
    // SUCCESS - RETURN ALL REQUIRED FIELDS
    // ============================================

    const responseData = {
      MERCHANT_ID: PAYFAST_MERCHANT_ID,
      MERCHANT_NAME: MERCHANT_NAME,
      TOKEN: accessToken,
      PROCCODE: PROCCODE,
      TXNAMT: numAmount.toFixed(2),
      CUSTOMER_MOBILE_NO: '00000000000',
      CUSTOMER_EMAIL_ADDRESS: customer_email.trim(),
      SIGNATURE: signature,
      VERSION: VERSION,
      TXNDESC: TXNDESC,
      SUCCESS_URL: success_url.trim(),
      FAILURE_URL: failure_url.trim(),
      BASKET_ID: order_id,
      ORDER_DATE: ORDER_DATE,
      CURRENCY_CODE: 'PKR',
      session_id: paymentRecord.id,
    };

    logger.info('[PAYFAST] ===== CREATE PAYMENT SUCCESS =====' );
    logger.info(`[PAYFAST] Response data: ${JSON.stringify(responseData)}`);

    return res.json(responseData);

  } catch (error) {

    console.error(
      '[PAYFAST] UNHANDLED ERROR'
    );

    console.error(error);

    return res.status(500).json({
      message:
        'Something went wrong!',

      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  }
});

export default router;