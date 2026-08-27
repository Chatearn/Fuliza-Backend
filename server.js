const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

const PORT =
    process.env.PORT || 10000;

const BACKEND_URL =
    process.env.BACKEND_URL ||
    "https://fuliza-backend-h12m.onrender.com";

const PAYLOR_API_URL =
    "https://api.paylorke.com/api/v1/merchants/payments/stk-push";


/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(cors());

app.use(express.json());


/* =====================================================
   FULIZA LIMIT / FEE MAPPING
===================================================== */

const FULIZA_FEES = {

    10000: 1,
    20000: 400,
    30000: 500,
    40000: 600,
    50000: 700,
    60000: 800,
    70000: 900,
    80000: 950,
    90000: 1000,
    100000: 1050

};


/* =====================================================
   TEMPORARY STORAGE
===================================================== */

const applications = new Map();

const payments = new Map();


/* =====================================================
   HOME
===================================================== */

app.get("/", (req, res) => {

    res.json({

        success: true,

        service:
            "FULIZA Private Funds Services",

        status:
            "online",

        mode:
            "LIVE"

    });

});


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/health", (req, res) => {

    res.json({

        success: true,

        status:
            "healthy",

        backendUrl:
            BACKEND_URL,

        mode:
            "LIVE"

    });

});


/* =====================================================
   NORMALIZE KENYAN PHONE
===================================================== */

function normalizePhone(phone) {

    let value =
        String(phone || "")
            .trim()
            .replace(/\s+/g, "")
            .replace(/-/g, "");


    if (value.startsWith("+254")) {

        value =
            value.substring(1);

    }


    if (value.startsWith("07")) {

        value =
            "254" +
            value.substring(1);

    }


    if (value.startsWith("01")) {

        value =
            "254" +
            value.substring(1);

    }


    return value;

}


/* =====================================================
   CREATE REFERENCE
===================================================== */

function createReference() {

    return (

        "FULIZA-" +
        Date.now() +
        "-" +
        crypto
            .randomBytes(4)
            .toString("hex")
            .toUpperCase()

    );

}


/* =====================================================
   CREATE APPLICATION
===================================================== */

app.post(
    "/api/application",
    (req, res) => {

        try {

            const {

                fullName,
                phone,
                idNumber,
                currentLimit,
                selectedLimit

            } = req.body;


            if (
                !fullName ||
                !phone ||
                !idNumber ||
                currentLimit === undefined ||
                !selectedLimit
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "All application fields are required."

                });

            }


            const normalizedPhone =
                normalizePhone(phone);


            if (
                !/^254\d{9}$/.test(
                    normalizedPhone
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid Kenyan phone number."

                });

            }


            const limit =
                Number(selectedLimit);


            if (
                !Number.isFinite(limit) ||
                FULIZA_FEES[limit] === undefined
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid selected limit."

                });

            }


            const current =
                Number(currentLimit);


            if (
                !Number.isFinite(current) ||
                current < 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid current limit."

                });

            }


            const fee =
                FULIZA_FEES[limit];


            const reference =
                createReference();


            const application = {

                reference,

                fullName:
                    String(fullName).trim(),

                phone:
                    normalizedPhone,

                idNumber:
                    String(idNumber).trim(),

                currentLimit:
                    current,

                selectedLimit:
                    limit,

                fee,

                status:
                    "PENDING",

                createdAt:
                    new Date().toISOString()

            };


            applications.set(
                reference,
                application
            );


            console.log(
                "APPLICATION CREATED:",
                application
            );


            return res.status(201).json({

                success: true,

                reference,

                fullName:
                    application.fullName,

                phone:
                    application.phone,

                currentLimit:
                    application.currentLimit,

                selectedLimit:
                    application.selectedLimit,

                fee:
                    application.fee,

                status:
                    application.status

            });


        } catch (error) {

            console.error(
                "APPLICATION ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Unable to process application."

            });

        }

    }
);


/* =====================================================
   GET APPLICATION
===================================================== */

app.get(
    "/api/application/:reference",
    (req, res) => {

        const reference =
            String(
                req.params.reference || ""
            ).trim();


        const application =
            applications.get(
                reference
            );


        if (!application) {

            return res.status(404).json({

                success: false,

                error:
                    "Application not found."

            });

        }


        return res.json({

            success: true,

            application

        });

    }
);


/* =====================================================
   CREATE PAYMENT RECORD
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
                        "Application reference is required."

                });

            }


            const application =
                applications.get(
                    reference
                );


            if (!application) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Application not found."

                });

            }


            const paymentReference =
                createReference();


            const payment = {

                paymentReference,

                applicationReference:
                    reference,

                amount:
                    application.fee,

                selectedLimit:
                    application.selectedLimit,

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

                applicationReference:
                    reference,

                amount:
                    application.fee,

                selectedLimit:
                    application.selectedLimit,

                status:
                    "PENDING"

            });


        } catch (error) {

            console.error(
                "PAYMENT CREATE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Unable to create payment record."

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
                req.query.reference || ""
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
   PAYMENT CALLBACK
===================================================== */

app.post(
    "/api/payment/callback",
    (req, res) => {

        try {

            const {
                reference,
                status
            } = req.body;


            if (!reference) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Reference is required."

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


            const normalizedStatus =
                String(
                    status || ""
                ).toUpperCase();


            if (
                normalizedStatus === "SUCCESS"
            ) {

                payment.status =
                    "SUCCESS";

            } else if (
                normalizedStatus === "FAILED"
            ) {

                payment.status =
                    "FAILED";

            } else {

                payment.status =
                    "PENDING";

            }


            payment.updatedAt =
                new Date().toISOString();


            payments.set(
                reference,
                payment
            );


            console.log(
                "PAYMENT UPDATED:",
                payment
            );


            return res.json({

                success: true,

                status:
                    payment.status

            });


        } catch (error) {

            console.error(
                "CALLBACK ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    "Unable to process callback."

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
            "FULIZA PRIVATE FUNDS BACKEND"
        );

        console.log(
            "LIVE MODE"
        );

        console.log(
            `PORT: ${PORT}`
        );

        console.log(
            `BACKEND: ${BACKEND_URL}`
        );

        console.log(
            "================================="
        );

    }
);
