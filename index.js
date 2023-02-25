const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
const ObjectId = require("mongodb").ObjectId;
const jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();
const port = process?.env?.PORT;
const stripe = require("stripe")(process?.env?.STRIPE_SK)
// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h6ly4.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send("forbidden access");
    }
    req.decoded = decoded;
    next();
  });
};


async function run() {
  try {
    client.connect();
    const database = client.db("comfort-zone");
    const productCollection = database.collection("products");
    const purchaseCollection = database.collection("purchase");
    const userCollection = database.collection("users");
    const reviewCollection = database.collection("reviews");
    const paymentCollection = database.collection("payments")
    // note: make sure that verifyAdmin will use after verifyJwt

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = {email: decodedEmail}
      const user = await userCollection.findOne(query)
      if(user?.role !== 'admin'){
        return res.status(403).send('forbidden access')
      }

      next()
    }
    
    app.post('/products', async(req, res) => {
      const product = req.body;
      
      const result = await productCollection.insertOne(product);
      res.send(result)
    })


    app.get("/products", async (req, res) => {
      const query = {};
      const result = await productCollection.find(query).toArray();

      res.send(result);
    });

    app.delete("/product/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/product/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });


    app.post("/purchase", verifyJwt, async (req, res) => {
      const product = req.body;
      

      const query = {
        email: product?.email,
        date: product?.date,
        name: product?.name,
      };

      const alreadyPurchase = await purchaseCollection.find(query).toArray();

      if (alreadyPurchase.length) {
        const message = `already have purchase`;
        return res.send({ acknowledged: false, message });
      }

      const result = await purchaseCollection.insertOne(product);
      res.send(result);
    });

    app.get("/purchases", verifyJwt, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await purchaseCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/purchases/:id", verifyJwt,  async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await purchaseCollection.deleteOne(query)
      res.send(result)
    })

    app.post("/user", async (req, res) => {
      const user = req.body;
      const email = user.email;
      const query = { email: email };
      const alreadyUser = await userCollection.find(query).toArray();
      if (alreadyUser.length) {
        return res.send({ acknowledged: false });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/allUsers", verifyJwt, verifyAdmin, async (req, res) => {
      const query = {};
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

  

    app.get('/allUsers/admin/:email', async(req, res) => {
       const email = req.params.email;
       const query = {email: email};
       const user = await userCollection.findOne(query);
       res.send({isAdmin: user?.role === 'admin'})
    })


    app.put('/allUsers/admin/:id', verifyJwt, verifyAdmin, async(req, res) => {

     

      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
  
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result)
      
    })

    app.get('/reviews',  async(req, res) => {
      const query ={}
      const result = await reviewCollection.find(query).toArray();
      res.send(result)
    })

    app.post('/reviews', verifyJwt, async(req, res) => {
      const review = req.body;
      const result =  await reviewCollection.insertOne(review);
      res.send(result)
    })


    app.get('/purchases/:id', verifyJwt,  async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await purchaseCollection.findOne(query);
      res.send(result)
    })


    app.post("/create-payment-intent", async (req, res) => {
      const purchase = req.body;
      const price = purchase.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        
        currency: "usd",
        amount: amount,
        "payment_method_types": [
          "card"
        ]
      });
    
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });


    app.post('/payments', verifyJwt,  async(req, res) => {
      const payment = req.body;
      const id = payment.purchaseId;
      const result = await paymentCollection.insertOne(payment);
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId
        }
      }

      const updatedResult = await purchaseCollection.updateOne(filter, updatedDoc);
      
      res.send(result)
    })



    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        return res.send({ accessToken: token });
      }

      res.status(403).send({ accessToken: "" });
    });
  } finally {
    // await client.close();
  }
}


run().catch(console.dir);


app.get("/", (req, res) => {
  res.send("comfort zone server");
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
