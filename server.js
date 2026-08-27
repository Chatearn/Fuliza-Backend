require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const PAYLOR_BASE_URL =
    "https://api.paylorke.com/api/v1";

const PAYLOR_API_KEY =
    process.env.PAYLOR_API_KEY;

const PAYLOR_CHANNEL_ID =
    process.env.PAYLOR_CHANNEL_ID;

const PAYLOR_WEBHOOK_SECRET =
    process.env.PAYLOR_WEBHOOK_SECRET;

const PUBLIC_BASE_URL =
    process.env.PUBLIC_BASE_URL;


/*
=====================================================
  BASIC CONFIGURATION CHECK
=====================================================
*/

if (!PAYLOR_API_KEY) {
    console.error(
        "ERROR: PAYLOR_API_KEY is missing."
    );
}

if (!PUBLIC_BASE_URL) {
    console.warn(
        "WARNING: PUBLIC_BASE_URL is not configured."
    );
}


/*
=====================================================
  CORS
=====================================================
*/

app.use(
    cors({
        origin: true,
        methods: ["GET", "POST"],
        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ]
    })
);


/*
=====================================================
  RAW BODY + JSON PARSER
=====================================================

  We keep the original request bytes because
  Paylor webhook signatures are calculated from
  the exact raw body.
=====================================================
*/

app.use(
    express.json({
        verify: (req, res, buffer) => {
            req.rawBody = buffer;
        }
    })
);


/*
=====================================================
  HEALTH CHECK
=====================================================
*/

app.get("/", (req, res) => {

    res.json({
        success: true,
        service: "FULIZA Paylor Backend",
        status: "online"
    });

});


/*
=====================================================
  PHONE NORMALIZATION
=====================================================
*/

function normalizeKenyanPhone(phone) {

    if (!phone) {
        return null;
    }

    let value =
        String(phone)
            .trim()
            .replace(/\s+/g, "")
            .replace(/-/g, "");

    if (value.startsWith("+")) {
        value = value.substring(1);
    }

    /*
      07XXXXXXXX
      01XXXXXXXX
    */

    if (/^(07|01)\d{8}$/.test(value)) {

        return "254" + value.substring(1);

    }

    /*
      254XXXXXXXXX
    */

    if (/^254\d{9}$/.test(value)) {

        return value;

    }

    return null;
}


/*
=====================================================
  AMOUNT VALIDATION
=====================================================
*/

function validAmount(amount) {

    const number =
        Number(amount);

    if (
        !Number.isInteger(number) ||
        number <= 0
    ) {

        return false;

    }

    return true;
}


/*
=====================================================
  CREATE PAYMENT REFERENCE
=====================================================
*/

function createPaymentReference() {

    return (
        "FUL-" +
        Date.now().toString(36).toUpperCase() +
        "-" +
        crypto.randomBytes(3)
            .toString("hex")
            .toUpperCase()
    );

}


/*
=====================================================
  STK PUSH
=====================================================
*/

app.post(
    "/api/stk-push",
    async (req, res) => {

        try {

            const {
                phone,
                amount,
                selectedLimit,
                fullName,
                reference
            } = req.body;


            /*
            -----------------------------------------
              VALIDATE PHONE
            -----------------------------------------
            */

            const stkPhone =
                normalizeKenyanPhone(phone);

            if (!stkPhone) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid Kenyan M-PESA phone number."

                });

            }


            /*
            -----------------------------------------
              VALIDATE AMOUNT
            -----------------------------------------
            */

            if (!validAmount(amount)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment amount."

                });

            }


            /*
            -----------------------------------------
              REFERENCE
            -----------------------------------------
            */

            const paymentReference =
                reference &&
                String(reference).trim()
                    ? String(reference).trim()
                    : createPaymentReference();


            /*
            -----------------------------------------
              CALLBACK URL
            -----------------------------------------
            */

            const callbackUrl =
                PUBLIC_BASE_URL
                    ? `${PUBLIC_BASE_URL}/api/paylor-callback`
                    : undefined;


            /*
            -----------------------------------------
              PAYLOAD
            -----------------------------------------
            */

            const payload = {

                phone: stkPhone,

                amount:
                    Number(amount),

                reference:
                    paymentReference,

                description:
                    "FULIZA payment"

            };


            /*
              Only send channelId when configured.
              Paylor can use the default active
              channel when channelId is omitted.
            */

            if (PAYLOR_CHANNEL_ID) {

                payload.channelId =
                    PAYLOR_CHANNEL_ID;

            }


            if (callbackUrl) {

                payload.callbackUrl =
                    callbackUrl;

            }


            /*
            -----------------------------------------
              IDEMPOTENCY KEY
            -----------------------------------------
            */

            const idempotencyKey =
                paymentReference;


            /*
            -----------------------------------------
              PAYLOR REQUEST
            -----------------------------------------
            */

            console.log(
                "STK request received:",
                {
                    phone: stkPhone,
                    amount: Number(amount),
                    reference: paymentReference,
                    selectedLimit,
                    fullName
                }
            );


            const response =
                await axios.post(

                    `${PAYLOR_BASE_URL}/merchants/payments/stk-push`,

                    payload,

                    {
                        headers: {

                            Authorization:
                                `Bearer ${PAYLOR_API_KEY}`,

                            "Content-Type":
                                "application/json",

                            "Idempotency-Key":
                                idempotencyKey

                        },

                        timeout: 30000

                    }

                );


            const data =
                response.data;


            console.log(
                "PAYLOR RESPONSE:",
                data
            );


            /*
            -----------------------------------------
              RETURN TO FRONTEND
            -----------------------------------------
            */

            return res.status(200).json({

                success: true,

                message:
                    "STK Push sent successfully. Check your M-PESA phone.",

                transactionId:
                    data.transactionId || null,

                reference:
                    paymentReference,

                status:
                    data.status || "SENT"

            });


        } catch (error) {

            console.error(
                "STK PUSH ERROR:"
            );


            if (error.response) {

                console.error(
                    "Paylor status:",
                    error.response.status
                );

                console.error(
                    "Paylor data:",
                    error.response.data
                );

            } else {

                console.error(
                    error.message
                );

            }


            const statusCode =
                error.response?.status || 500;


            const paylorData =
                error.response?.data;


            const message =
                paylorData?.message ||
                paylorData?.error?.message ||
                "Unable to initiate STK Push.";


            return res.status(statusCode).json({

                success: false,

                message

            });

        }

    }
);


/*
=====================================================
  PAYLOR CALLBACK / WEBHOOK
=====================================================

  Paylor signs callbacks using HMAC-SHA256.

  Header:
  X-Webhook-Signature
=====================================================
*/

app.post(
    "/api/paylor-callback",
    (req, res) => {

        try {

            const signature =
                req.headers[
                    "x-webhook-signature"
                ];


            if (
                !signature ||
                !PAYLOR_WEBHOOK_SECRET
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Webhook signature missing."

                });

            }


            const expectedSignature =
                crypto
                    .createHmac(
                        "sha256",
                        PAYLOR_WEBHOOK_SECRET
                    )
                    .update(
                        req.rawBody
                    )
                    .digest("hex");


            /*
            -----------------------------------------
              SAFE SIGNATURE COMPARISON
            -----------------------------------------
            */

            const receivedBuffer =
                Buffer.from(
                    String(signature),
                    "utf8"
                );

            const expectedBuffer =
                Buffer.from(
                    expectedSignature,
                    "utf8"
                );


            if (
                receivedBuffer.length !==
                expectedBuffer.length
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid webhook signature."

                });

            }


            if (
                !crypto.timingSafeEqual(
                    receivedBuffer,
                    expectedBuffer
                )
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid webhook signature."

                });

            }


            /*
            -----------------------------------------
              VERIFIED PAYLOR CALLBACK
            -----------------------------------------
            */

            const event =
                req.body.event;

            const transaction =
                req.body.transaction;


            console.log(
                "VERIFIED PAYLOR CALLBACK:",
                {
                    event,
                    transaction
                }
            );


            /*
            -----------------------------------------
              PAYMENT SUCCESS
            -----------------------------------------
            */

            if (
                event ===
                "payment.success"
            ) {

                console.log(
                    "PAYMENT SUCCESS:",
                    transaction?.reference
                );

                /*
                  IMPORTANT:

                  This is where you should update
                  your database/order to PAID.

                  Do NOT mark a payment as paid merely
                  because STK Push was SENT.
                */

            }


            /*
            -----------------------------------------
              PAYMENT FAILURE
            -----------------------------------------
            */

            if (
                event ===
                "payment.failed"
            ) {

                console.log(
                    "PAYMENT FAILED:",
                    transaction?.reference
                );

            }


            /*
            -----------------------------------------
              ACKNOWLEDGE CALLBACK
            -----------------------------------------
            */

            return res.status(200).json({

                received: true

            });


        } catch (error) {

            console.error(
                "CALLBACK ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Webhook processing failed."

            });

        }

    }
);


/*
=====================================================
  QUERY PAYMENT STATUS
=====================================================
*/

app.get(
    "/api/payment-status/:transactionId",
    async (req, res) => {

        try {

            const transactionId =
                req.params.transactionId;


            if (!transactionId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Transaction ID is required."

                });

            }


            const response =
                await axios.get(

                    `${PAYLOR_BASE_URL}/merchants/payments/transactions/${encodeURIComponent(transactionId)}`,

                    {
                        headers: {

                            Authorization:
                                `Bearer ${PAYLOR_API_KEY}`,

                            "Content-Type":
                                "application/json"

                        },

                        timeout: 30000

                    }

                );


            return res.status(200).json({

                success: true,

                transaction:
                    response.data

            });


        } catch (error) {

            console.error(
                "STATUS ERROR:",
                error.response?.data ||
                error.message
            );


            return res.status(
                error.response?.status || 500
            ).json({

                success: false,

                message:
                    error.response?.data?.message ||
                    "Unable to check payment status."

            });

        }

    }
);


/*
=====================================================
  START SERVER
=====================================================
*/

app.listen(
    PORT,
    () => {

        console.log(
            `FULIZA backend running on port ${PORT}`
        );

    }
);
