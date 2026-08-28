const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const PAYLOR_API_KEY =
    process.env.PAYLOR_API_KEY;

const PAYLOR_CHANNEL_ID =
    process.env.PAYLOR_CHANNEL_ID;

const PAYLOR_WEBHOOK_SECRET =
    process.env.PAYLOR_WEBHOOK_SECRET;

const PUBLIC_BASE_URL =
    process.env.PUBLIC_BASE_URL;


/* =====================================================
   PAYMENT STATUS STORAGE

   Stores transactions while this server is running.
===================================================== */

const payments = new Map();


/* =====================================================
   RAW BODY + JSON PARSING
===================================================== */

app.use(
    express.json({
        verify: (req, res, buffer) => {

            req.rawBody = buffer;

        }
    })
);


/* =====================================================
   BASIC CORS
===================================================== */

app.use((req, res, next) => {

    res.header(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
    );

    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if(req.method === "OPTIONS"){

        return res.sendStatus(200);

    }

    next();

});


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/", (req, res) => {

    res.json({

        success: true,

        service:
            "FULIZA Paylor Backend",

        status:
            "online"

    });

});


/* =====================================================
   STK PUSH
===================================================== */

app.post("/api/stk-push", async (req, res) => {

    try {

        console.log(
            "STK request received"
        );


        const {
            phone,
            amount,
            selectedLimit,
            fullName,
            reference
        } = req.body;


        /* -----------------------------------------
           VALIDATION
        ----------------------------------------- */

        if(!phone){

            return res.status(400).json({

                success: false,

                message:
                    "Phone number is required."

            });

        }


        if(!amount){

            return res.status(400).json({

                success: false,

                message:
                    "Payment amount is required."

            });

        }


        if(!reference){

            return res.status(400).json({

                success: false,

                message:
                    "Payment reference is required."

            });

        }


        if(!PAYLOR_API_KEY){

            console.error(
                "PAYLOR_API_KEY is missing."
            );

            return res.status(500).json({

                success: false,

                message:
                    "Paylor API configuration is missing."

            });

        }


        if(!PAYLOR_CHANNEL_ID){

            console.error(
                "PAYLOR_CHANNEL_ID is missing."
            );

            return res.status(500).json({

                success: false,

                message:
                    "Paylor channel configuration is missing."

            });

        }


        /* -----------------------------------------
           CALLBACK URL
        ----------------------------------------- */

        const callbackUrl =
            `${PUBLIC_BASE_URL}/api/paylor-callback`;


        /* -----------------------------------------
           PAYLOR REQUEST
        ----------------------------------------- */

        const paylorPayload = {

            phone:
                String(phone),

            amount:
                Number(amount),

            reference:
                String(reference),

            channelId:
                PAYLOR_CHANNEL_ID,

            description:
                `FULIZA payment - ${
                    fullName || "Customer"
                }`,

            callbackUrl:
                callbackUrl

        };


        console.log(
            "Sending STK request to Paylor:",
            {
                phone:
                    paylorPayload.phone,

                amount:
                    paylorPayload.amount,

                reference:
                    paylorPayload.reference,

                channelId:
                    paylorPayload.channelId,

                callbackUrl:
                    paylorPayload.callbackUrl
            }
        );


        /* -----------------------------------------
           PAYLOR API
        ----------------------------------------- */

        const paylorResponse =
            await fetch(
                "https://api.paylorke.com/api/v1/merchants/payments/stk-push",
                {

                    method: "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${PAYLOR_API_KEY}`,

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify(
                            paylorPayload
                        )

                }
            );


        /* -----------------------------------------
           READ PAYLOR RESPONSE SAFELY
        ----------------------------------------- */

        const responseText =
            await paylorResponse.text();


        let paylorData = {};


        if(responseText.trim()){

            try {

                paylorData =
                    JSON.parse(
                        responseText
                    );

            } catch(error) {

                console.error(
                    "Paylor returned non-JSON response:",
                    responseText
                );

                return res.status(
                    paylorResponse.status || 502
                ).json({

                    success: false,

                    message:
                        "Paylor returned an unexpected response.",

                    status:
                        paylorResponse.status,

                    raw:
                        responseText

                });

            }

        }


        console.log(
            "PAYLOR RESPONSE:",
            paylorData
        );


        /* -----------------------------------------
           PAYLOR ERROR
        ----------------------------------------- */

        if(!paylorResponse.ok){

            return res.status(
                paylorResponse.status || 502
            ).json({

                success: false,

                message:
                    paylorData.message ||
                    paylorData.error ||
                    "Paylor rejected the STK request.",

                paylor:
                    paylorData

            });

        }


        /* -----------------------------------------
           TRANSACTION ID
        ----------------------------------------- */

        const transactionId =
            paylorData.transactionId;


        if(!transactionId){

            console.error(
                "Paylor response did not contain transactionId:",
                paylorData
            );

            return res.status(502).json({

                success: false,

                message:
                    "Paylor did not return a transaction ID."

            });

        }


        /* -----------------------------------------
           SAVE INITIAL PAYMENT STATUS
        ----------------------------------------- */

        payments.set(
            String(transactionId),
            {

                transactionId:
                    String(transactionId),

                reference:
                    String(reference),

                status:
                    paylorData.status ||
                    "PENDING",

                amount:
                    Number(amount),

                selectedLimit:
                    selectedLimit
                        ? Number(selectedLimit)
                        : null,

                createdAt:
                    new Date().toISOString(),

                updatedAt:
                    new Date().toISOString()

            }
        );


        /* -----------------------------------------
           SUCCESSFUL STK REQUEST
        ----------------------------------------- */

        return res.json({

            success: true,

            message:
                "STK Push sent successfully. Check your M-PESA phone.",

            transactionId:
                String(transactionId),

            status:
                paylorData.status ||
                "PENDING",

            reference:
                reference,

            selectedLimit:
                selectedLimit,

            amount:
                Number(amount)

        });


    } catch(error) {

        console.error(
            "STK PUSH ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                error.message ||
                "Unable to process STK Push."

        });

    }

});


/* =====================================================
   PAYMENT STATUS

   Frontend can check:

   GET /api/payment-status/TRANSACTION_ID
===================================================== */

app.get(
    "/api/payment-status/:transactionId",
    (req, res) => {

        try {

            const transactionId =
                String(
                    req.params.transactionId
                ).trim();


            if(!transactionId){

                return res.status(400).json({

                    success: false,

                    message:
                        "Transaction ID is required."

                });

            }


            const payment =
                payments.get(
                    transactionId
                );


            /* -----------------------------------------
               TRANSACTION NOT FOUND
            ----------------------------------------- */

            if(!payment){

                return res.status(404).json({

                    success: false,

                    message:
                        "Transaction not found.",

                    transactionId:
                        transactionId

                });

            }


            /* -----------------------------------------
               RETURN STATUS
            ----------------------------------------- */

            return res.json({

                success: true,

                transactionId:
                    payment.transactionId,

                reference:
                    payment.reference,

                status:
                    payment.status,

                amount:
                    payment.amount,

                selectedLimit:
                    payment.selectedLimit,

                mpesaReceipt:
                    payment.mpesaReceipt ||
                    null,

                providerRef:
                    payment.providerRef ||
                    null,

                failureReason:
                    payment.failureReason ||
                    null,

                createdAt:
                    payment.createdAt,

                updatedAt:
                    payment.updatedAt

            });


        } catch(error) {

            console.error(
                "PAYMENT STATUS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve payment status."

            });

        }

    }
);


/* =====================================================
   PAYLOR CALLBACK
===================================================== */

app.post(
    "/api/paylor-callback",
    (req, res) => {

        try {

            console.log(
                "PAYLOR CALLBACK RECEIVED"
            );


            const signature =
                req.headers[
                    "x-webhook-signature"
                ];


            if(!PAYLOR_WEBHOOK_SECRET){

                console.error(
                    "PAYLOR_WEBHOOK_SECRET is missing."
                );

                return res.status(500).json({

                    success: false,

                    message:
                        "Webhook secret is not configured."

                });

            }


            if(!signature){

                console.error(
                    "Webhook signature missing."
                );

                return res.status(401).json({

                    success: false,

                    message:
                        "Webhook signature missing."

                });

            }


            /* -----------------------------------------
               VERIFY HMAC SHA-256
            ----------------------------------------- */

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


            const suppliedBuffer =
                Buffer.from(
                    signature,
                    "utf8"
                );

            const expectedBuffer =
                Buffer.from(
                    expectedSignature,
                    "utf8"
                );


            const validSignature =
                suppliedBuffer.length ===
                    expectedBuffer.length &&
                crypto.timingSafeEqual(
                    suppliedBuffer,
                    expectedBuffer
                );


            if(!validSignature){

                console.error(
                    "INVALID PAYLOR WEBHOOK SIGNATURE"
                );

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid webhook signature."

                });

            }


            /* -----------------------------------------
               VERIFIED CALLBACK
            ----------------------------------------- */

            const {
                event,
                transaction
            } = req.body;


            console.log(
                "VERIFIED PAYLOR CALLBACK:",
                {
                    event,
                    transaction
                }
            );


            if(!transaction){

                return res.status(400).json({

                    success: false,

                    message:
                        "Transaction data is missing."

                });

            }


            const transactionId =
                transaction.id
                    ? String(transaction.id)
                    : null;


            const reference =
                transaction.reference
                    ? String(transaction.reference)
                    : null;


            /* -----------------------------------------
               FIND EXISTING PAYMENT
            ----------------------------------------- */

            let payment = null;


            if(transactionId){

                payment =
                    payments.get(
                        transactionId
                    );

            }


            /* -----------------------------------------
               CREATE RECORD IF NEEDED
            ----------------------------------------- */

            if(!payment){

                payment = {

                    transactionId:
                        transactionId,

                    reference:
                        reference,

                    status:
                        transaction.status ||
                        "PENDING",

                    amount:
                        transaction.amount
                            ? Number(
                                transaction.amount
                            )
                            : null,

                    selectedLimit:
                        null,

                    createdAt:
                        new Date().toISOString(),

                    updatedAt:
                        new Date().toISOString()

                };

            }


            /* -----------------------------------------
               UPDATE COMMON DATA
            ----------------------------------------- */

            payment.transactionId =
                transactionId ||
                payment.transactionId;

            payment.reference =
                reference ||
                payment.reference;

            payment.amount =
                transaction.amount !== undefined
                    ? Number(transaction.amount)
                    : payment.amount;

            payment.providerRef =
                transaction.providerRef ||
                payment.providerRef ||
                null;

            payment.updatedAt =
                new Date().toISOString();


            /* -----------------------------------------
               PAYMENT SUCCESS
            ----------------------------------------- */

            if(
                event ===
                "payment.success"
            ){

                payment.status =
                    "COMPLETED";


                if(
                    transaction.metadata &&
                    transaction.metadata.mpesaReceipt
                ){

                    payment.mpesaReceipt =
                        transaction
                            .metadata
                            .mpesaReceipt;

                }


                console.log(
                    "PAYMENT SUCCESS:",
                    transaction
                );

            }


            /* -----------------------------------------
               PAYMENT FAILED
            ----------------------------------------- */

            if(
                event ===
                "payment.failed"
            ){

                payment.status =
                    "FAILED";


                if(
                    transaction.metadata &&
                    transaction.metadata.callbackResultDesc
                ){

                    payment.failureReason =
                        transaction
                            .metadata
                            .callbackResultDesc;

                }


                console.log(
                    "PAYMENT FAILED:",
                    transaction
                );

            }


            /* -----------------------------------------
               SAVE UPDATED PAYMENT
            ----------------------------------------- */

            if(payment.transactionId){

                payments.set(
                    payment.transactionId,
                    payment
                );

            }


            /* -----------------------------------------
               RESPOND QUICKLY
            ----------------------------------------- */

            return res.json({

                received:
                    true,

                success:
                    true

            });


        } catch(error) {

            console.error(
                "CALLBACK ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Callback processing failed."

            });

        }

    }
);


/* =====================================================
   START SERVER
===================================================== */

app.listen(
    PORT,
    () => {

        console.log(
            `FULIZA backend running on port ${PORT}`
        );

    }
);
