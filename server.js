const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");

require("dotenv").config();

const app = express();

const PORT =
    process.env.PORT || 10000;

const BACKEND_URL =
    process.env.BACKEND_URL ||
    "https://your-backend.onrender.com";


/* =====================================================
   PAYLOR
===================================================== */

const PAYLOR_API_URL =
    "https://api.paylorke.com/api/v1/merchants/payments/stk-push";

const PAYLOR_QUERY_URL =
    "https://api.paylorke.com/api/v1/merchants/payments/transactions";


/* =====================================================
   MIDDLEWARE
===================================================== */

/*
 * IMPORTANT:
 * Keep the raw request body because Paylor
 * signs the exact bytes it sends.
 */

app.use(
    express.json({
        verify: (req, res, buf) => {
            req.rawBody = buf;
        }
    })
);

app.use(cors());


/* =====================================================
   SERVICE PAYMENT CONFIGURATION
===================================================== */

/*
 * Replace these with the prices for your
 * legitimate products/services.
 */

const SERVICE_PRICES = {

    1000: 1000,
    2000: 2000,
    3000: 3000,
    5000: 5000

};


/* =====================================================
   TEMPORARY STORAGE
===================================================== */

const orders = new Map();

const payments = new Map();


/* =====================================================
   HOME
===================================================== */

app.get(
    "/",
    (req, res) => {

        res.json({

            success: true,

            service:
                "Private Service Payment Backend",

            status:
                "online",

            mode:
                "LIVE PAYMENT"

        });

    }
);


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get(
    "/health",
    (req, res) => {

        res.json({

            success: true,

            status:
                "healthy",

            backendUrl:
                BACKEND_URL,

            paylorConfigured:
                Boolean(
                    process.env.PAYLOR_API_KEY
                ),

            channelConfigured:
                Boolean(
                    process.env.PAYLOR_CHANNEL_ID
                ),

            webhookConfigured:
                Boolean(
                    process.env.PAYLOR_WEBHOOK_SECRET
                )

        });

    }
);


/* =====================================================
   NORMALIZE KENYAN PHONE
===================================================== */

function normalizePhone(phone) {

    let value =
        String(phone || "")
            .trim()
            .replace(/\s+/g, "")
            .replace(/-/g, "");


    if (
        value.startsWith("+254")
    ) {

        value =
            value.substring(1);

    }


    if (
        /^(07|01)\d{8}$/.test(value)
    ) {

        value =
            "254" +
            value.substring(1);

    }


    return value;

}


/* =====================================================
   VALIDATE PHONE
===================================================== */

function isValidPhone(phone) {

    return /^254\d{9}$/.test(
        phone
    );

}


/* =====================================================
   CREATE REFERENCE
===================================================== */

function createReference(prefix = "ORDER") {

    return (

        prefix +
        "-" +
        Date.now() +
        "-" +
        crypto
            .randomBytes(4)
            .toString("hex")
            .toUpperCase()

    );

}


/* =====================================================
   CREATE ORDER
===================================================== */

app.post(
    "/api/order",
    (req, res) => {

        try {

            const {

                fullName,
                phone,
                service,
                amount

            } = req.body;


            if (
                !fullName ||
                !phone ||
                !service ||
                amount === undefined
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "All order fields are required."

                });

            }


            const normalizedPhone =
                normalizePhone(phone);


            if (
                !isValidPhone(
                    normalizedPhone
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid Kenyan phone number."

                });

            }


            const paymentAmount =
                Number(amount);


            if (
                !Number.isFinite(
                    paymentAmount
                ) ||
                paymentAmount <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid payment amount."

                });

            }


            const reference =
                createReference(
                    "ORDER"
                );


            const order = {

                reference,

                fullName:
                    String(
                        fullName
                    ).trim(),

                phone:
                    normalizedPhone,

                service:
                    String(
                        service
                    ).trim(),

                amount:
                    paymentAmount,

                status:
                    "PENDING",

                createdAt:
                    new Date().toISOString()

            };


            orders.set(
                reference,
                order
            );


            console.log(
                "ORDER CREATED:",
                order
            );


            return res.status(201).json({

                success: true,

                reference,

                fullName:
                    order.fullName,

                phone:
                    order.phone,

                service:
                    order.service,

                amount:
                    order.amount,

                status:
                    order.status

            });


        } catch (error) {

            console.error(
                "ORDER ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Unable to create order."

            });

        }

    }
);


/* =====================================================
   GET ORDER
===================================================== */

app.get(
    "/api/order/:reference",
    (req, res) => {

        const reference =
            String(
                req.params.reference || ""
            ).trim();


        const order =
            orders.get(
                reference
            );


        if (!order) {

            return res.status(404).json({

                success: false,

                error:
                    "Order not found."

            });

        }


        return res.json({

            success: true,

            order

        });

    }
);


/* =====================================================
   CREATE PAYMENT
===================================================== */

app.post(
    "/api/payment/create",
    (req, res) => {

        try {

            const {

                reference

            } = req.body;


            if (!reference) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Order reference is required."

                });

            }


            const order =
                orders.get(
                    reference
                );


            if (!order) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Order not found."

                });

            }


            if (
                order.status ===
                "COMPLETED"
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "This order has already been paid."

                });

            }


            const paymentReference =
                createReference(
                    "PAY"
                );


            const payment = {

                paymentReference,

                orderReference:
                    reference,

                amount:
                    order.amount,

                phone:
                    order.phone,

                status:
                    "PENDING",

                createdAt:
                    new Date().toISOString()

            };


            payments.set(
                paymentReference,
                payment
            );


            return res.json({

                success: true,

                paymentReference,

                orderReference:
                    reference,

                amount:
                    payment.amount,

                status:
                    payment.status

            });


        } catch (error) {

            console.error(
                "PAYMENT CREATE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Unable to create payment."

            });

        }

    }
);


/* =====================================================
   REAL PAYLOR STK PUSH
===================================================== */

app.post(
    "/api/payment/stk-push",
    async (req, res) => {

        try {

            const {

                paymentReference,
                phone

            } = req.body;


            /* -----------------------------------------
               VALIDATE REFERENCE
            ----------------------------------------- */

            if (
                !paymentReference
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Payment reference is required."

                });

            }


            /* -----------------------------------------
               FIND PAYMENT
            ----------------------------------------- */

            const payment =
                payments.get(
                    paymentReference
                );


            if (!payment) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Payment record not found."

                });

            }


            /* -----------------------------------------
               NORMALIZE PHONE
            ----------------------------------------- */

            const normalizedPhone =
                normalizePhone(
                    phone ||
                    payment.phone
                );


            if (
                !isValidPhone(
                    normalizedPhone
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid Kenyan M-PESA phone number."

                });

            }


            /* -----------------------------------------
               PAYLOR CREDENTIALS
            ----------------------------------------- */

            const apiKey =
                process.env.PAYLOR_API_KEY;


            const channelId =
                process.env.PAYLOR_CHANNEL_ID;


            const callbackUrl =
                process.env.PAYLOR_CALLBACK_URL;


            if (!apiKey) {

                return res.status(500).json({

                    success: false,

                    error:
                        "Paylor API key is not configured."

                });

            }


            /* -----------------------------------------
               BUILD PAYLOR REQUEST
            ----------------------------------------- */

            const payload = {

                phone:
                    normalizedPhone,

                amount:
                    Number(
                        payment.amount
                    ),

                reference:
                    paymentReference,

                description:
                    "Payment for Service"

            };


            /*
             * channelId is optional according
             * to Paylor documentation.
             */

            if (channelId) {

                payload.channelId =
                    channelId;

            }


            /*
             * callbackUrl is optional but
             * recommended for instant updates.
             */

            if (callbackUrl) {

                payload.callbackUrl =
                    callbackUrl;

            }


            console.log(
                "PAYLOR STK REQUEST:",
                {
                    phone:
                        normalizedPhone,

                    amount:
                        payment.amount,

                    reference:
                        paymentReference
                }
            );


            /* -----------------------------------------
               CALL PAYLOR
            ----------------------------------------- */

            const paylorResponse =
                await axios.post(

                    PAYLOR_API_URL,

                    payload,

                    {

                        headers: {

                            Authorization:
                                `Bearer ${apiKey}`,

                            "Content-Type":
                                "application/json",

                            "Idempotency-Key":
                                paymentReference

                        },

                        timeout:
                            30000

                    }

                );


            const paylorData =
                paylorResponse.data;


            console.log(
                "PAYLOR STK RESPONSE:",
                paylorData
            );


            /* -----------------------------------------
               SAVE PAYLOR TRANSACTION
            ----------------------------------------- */

            payment.phone =
                normalizedPhone;


            payment.transactionId =
                paylorData.transactionId;


            payment.status =
                paylorData.status ||
                "SENT";


            payment.updatedAt =
                new Date().toISOString();


            payments.set(
                paymentReference,
                payment
            );


            /* -----------------------------------------
               RETURN TO FRONTEND
            ----------------------------------------- */

            return res.json({

                success: true,

                message:
                    "STK Push sent successfully. Check your M-PESA phone.",

                paymentReference,

                transactionId:
                    paylorData.transactionId,

                status:
                    paylorData.status

            });


        } catch (error) {

            console.error(
                "PAYLOR STK ERROR:",
                error.response?.data ||
                error.message
            );


            return res.status(
                error.response?.status ||
                500
            ).json({

                success: false,

                error:
                    error.response?.data?.message ||
                    error.response?.data?.error ||
                    "Unable to send STK Push."

            });

        }

    }
);


/* =====================================================
   PAYLOR WEBHOOK
===================================================== */

app.post(
    "/api/paylor-callback",
    (req, res) => {

        try {

            const signature =
                req.headers[
                    "x-webhook-signature"
                ];


            const secret =
                process.env.PAYLOR_WEBHOOK_SECRET;


            if (
                !signature ||
                !secret
            ) {

                return res.status(401).json({

                    success: false,

                    error:
                        "Missing webhook signature."

                });

            }


            /* -----------------------------------------
               VERIFY RAW BODY
            ----------------------------------------- */

            const expectedSignature =
                crypto
                    .createHmac(
                        "sha256",
                        secret
                    )
                    .update(
                        req.rawBody
                    )
                    .digest("hex");


            const valid =
                crypto.timingSafeEqual(

                    Buffer.from(
                        signature
                    ),

                    Buffer.from(
                        expectedSignature
                    )

                );


            if (!valid) {

                return res.status(401).json({

                    success: false,

                    error:
                        "Invalid webhook signature."

                });

            }


            /* -----------------------------------------
               READ EVENT
            ----------------------------------------- */

            const {

                event,
                transaction

            } = req.body;


            console.log(
                "PAYLOR WEBHOOK:",
                req.body
            );


            if (
                !transaction ||
                !transaction.reference
            ) {

                return res.json({

                    received: true

                });

            }


            const paymentReference =
                transaction.reference;


            const payment =
                payments.get(
                    paymentReference
                );


            if (!payment) {

                console.warn(
                    "Payment not found:",
                    paymentReference
                );

                return res.json({

                    received: true

                });

            }


            /* -----------------------------------------
               SUCCESS
            ----------------------------------------- */

            if (
                event ===
                "payment.success"
            ) {

                payment.status =
                    "COMPLETED";


                payment.transactionId =
                    transaction.id;


                payment.providerRef =
                    transaction.providerRef ||
                    null;


                payment.mpesaReceipt =
                    transaction.metadata
                        ?.mpesaReceipt ||
                    null;


                payment.updatedAt =
                    new Date().toISOString();


                payments.set(
                    paymentReference,
                    payment
                );


                const order =
                    orders.get(
                        payment.orderReference
                    );


                if (order) {

                    order.status =
                        "COMPLETED";


                    order.updatedAt =
                        new Date().toISOString();


                    orders.set(
                        payment.orderReference,
                        order
                    );

                }


                console.log(
                    "PAYMENT COMPLETED:",
                    paymentReference
                );

            }


            /* -----------------------------------------
               FAILED
            ----------------------------------------- */

            else if (
                event ===
                "payment.failed"
            ) {

                payment.status =
                    "FAILED";


                payment.updatedAt =
                    new Date().toISOString();


                payments.set(
                    paymentReference,
                    payment
                );


                console.log(
                    "PAYMENT FAILED:",
                    paymentReference
                );

            }


            /* -----------------------------------------
               ACKNOWLEDGE PAYLOR
            ----------------------------------------- */

            return res.json({

                received: true

            });


        } catch (error) {

            console.error(
                "PAYLOR CALLBACK ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Unable to process Paylor callback."

            });

        }

    }
);


/* =====================================================
   PAYMENT STATUS
===================================================== */

app.get(
    "/api/payment/status",
    (req, res) => {

        const reference =
            String(
                req.query.reference ||
                ""
            ).trim();


        if (!reference) {

            return res.status(400).json({

                success: false,

                error:
                    "Payment reference is required."

            });

        }


        const payment =
            payments.get(
                reference
            );


        if (!payment) {

            return res.status(404).json({

                success: false,

                error:
                    "Payment record not found."

            });

        }


        return res.json({

            success: true,

            ...payment

        });

    }
);


/* =====================================================
   QUERY PAYLOR TRANSACTION
===================================================== */

app.get(
    "/api/payment/query/:transactionId",
    async (req, res) => {

        try {

            const transactionId =
                String(
                    req.params.transactionId ||
                    ""
                ).trim();


            if (!transactionId) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Transaction ID is required."

                });

            }


            const apiKey =
                process.env.PAYLOR_API_KEY;


            if (!apiKey) {

                return res.status(500).json({

                    success: false,

                    error:
                        "Paylor API key is not configured."

                });

            }


            const response =
                await axios.get(

                    `${PAYLOR_QUERY_URL}/${encodeURIComponent(transactionId)}`,

                    {

                        headers: {

                            Authorization:
                                `Bearer ${apiKey}`,

                            "Content-Type":
                                "application/json"

                        },

                        timeout:
                            30000

                    }

                );


            return res.json({

                success: true,

                transaction:
                    response.data

            });


        } catch (error) {

            console.error(
                "PAYLOR QUERY ERROR:",
                error.response?.data ||
                error.message
            );


            return res.status(
                error.response?.status ||
                500
            ).json({

                success: false,

                error:
                    error.response?.data?.message ||
                    error.response?.data?.error ||
                    "Unable to query transaction."

            });

        }

    }
);


/* =====================================================
   404
===================================================== */

app.use(
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "Route not found."

        });

    }
);


/* =====================================================
   SERVER
===================================================== */

app.listen(
    PORT,
    () => {

        console.log(
            "================================="
        );

        console.log(
            "PRIVATE SERVICE PAYMENT BACKEND"
        );

        console.log(
            "LIVE PAYLOR MODE"
        );

        console.log(
            `PORT: ${PORT}`
        );

        console.log(
            `BACKEND: ${BACKEND_URL}`
        );

        console.log(
            "PAYLOR API:",
            Boolean(
                process.env.PAYLOR_API_KEY
            )
        );

        console.log(
            "PAYLOR CHANNEL:",
            Boolean(
                process.env.PAYLOR_CHANNEL_ID
            )
        );

        console.log(
            "PAYLOR WEBHOOK:",
            Boolean(
                process.env.PAYLOR_WEBHOOK_SECRET
            )
        );

        console.log(
            "================================="
        );

    }
);
