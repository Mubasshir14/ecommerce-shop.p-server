require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3aom8f0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});



const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});




async function run() {
    try {
        await client.connect();

        const reviewCollection = client.db('shopDB').collection('reviews');
        const productCollection = client.db('shopDB').collection('products');
        const userCollection = client.db('shopDB').collection('users');
        const cartCollection = client.db('shopDB').collection('carts');
        const orderCollection = client.db('shopDB').collection('orders');
        const productReviewCollection = client.db('shopDB').collection('productReviews');



        // Generate JWT Token
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '24h'
            });
            res.send({ token });
        });

        // Middleware to Verify JWT Token
        const verifyToken = (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'Unauthorized Access' });
            }
            const token = authHeader.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(403).send({ message: 'Forbidden Access' });
                }
                req.user = decoded;
                next();
            });
        };

        // post product to db
        app.post('/product', async (req, res) => {
            const productItem = req.body;
            const result = await productCollection.insertOne(productItem);
            res.send(result);
        })
        // get all products
        app.get('/product', async (req, res) => {
            const result = await productCollection.find().toArray();
            res.send(result);
        })
        // get specific product by id
        app.get('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productCollection.findOne(query);
            res.send(result);
        })

        // delete product
        app.delete('/product/:id', async (req, res) => {
            const id = req.params.id;

            try {
                const query = { _id: new ObjectId(id) };
                const result = await productCollection.deleteOne(query);

                if (result.deletedCount === 1) {
                    res.status(200).json({ message: 'Product deleted successfully.' });
                } else {
                    res.status(404).json({ message: 'Product not found.' });
                }
            } catch (error) {
                console.error('Error deleting product:', error);
                res.status(500).json({ message: 'Internal server error.' });
            }
        });

        // update product
        app.patch('/product/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const updates = req.body;
                const query = { _id: new ObjectId(id) };

                // Update the product in the database
                const result = await productCollection.updateOne(query, { $set: updates });

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'Product not found' });
                }
                res.send(result);
            } catch (error) {
                console.error("Error updating product:", error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });

        // get all reviews
        app.get('/review', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        })

        // Add a new user
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'User Already Created', insertedId: null });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        // delete user
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })


        // PATCH route to set user role to "admin"
        app.patch('/users/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        // Get all users
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        // admin
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;

            if (!req.decoded || email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);

            let admin = false;
            if (user) {
                admin = user.role === 'admin';
            }

            res.send({ admin });
        });

        // Get all cart items for a specific user
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        // Add a new cart item
        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        });

        // Delete a cart item by ID
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });

        // post review
        app.post('/reviews', async (req, res) => {
            try {
                const { rating, reviewText, productName, name } = req.body; // Extract productId
                console.log('Received data:', req.body);

                const newReview = {
                    rating,
                    reviewText,
                    name,
                    productName, // Include productId
                    createdAt: new Date()
                };

                const result = await productReviewCollection.insertOne(newReview);
                res.status(201).send(result); // Send 201 status code for successful creation
            } catch (error) {
                console.error('Error inserting review:', error);
                res.status(500).send({ message: 'Error inserting review', error });
            }
        });

        // GET all reviews
        app.get('/reviews', async (req, res) => {
            try {
                // Fetch all reviews from the database
                const reviews = await productReviewCollection.find({}).toArray();

                res.status(200).send(reviews); // Send reviews with a 200 status code
            } catch (error) {
                console.error('Error fetching reviews:', error);
                res.status(500).send({ message: 'Error fetching reviews', error });
            }
        });


        //------------------------------------------- payment all api here----------------------------------------------------


        // PaymentIntent
        app.post('/create-payment-intent', async (req, res) => {
            const { amount, name, email, address, cart } = req.body;

            try {

                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount * 100,
                    currency: 'usd',
                    payment_method_types: ['card'],
                    metadata: { name, email, address },
                });


                // const orderDetails = {
                //     amount,
                //     name,
                //     email,
                //     address,
                //     cart,
                //     paymentIntentId: paymentIntent.id,
                //     status: 'pending',
                //     createdAt: new Date(),
                // };


                // const result = await orderCollection.insertOne(orderDetails);
                res.send({ clientSecret: paymentIntent.client_secret });
            } catch (error) {
                console.error('Error creating PaymentIntent:', error);
                res.status(500).send({ error: error.message });
            }
        });


        app.post('/payment', async (req, res) => {
            try {
                // Extract order details from the request body
                const order = req.body;
                
                // Add the status field to the order object
                order.status = 'pending';
                
                // Insert the order into the collection with the 'pending' status
                const result = await orderCollection.insertOne(order);
                
                // Send the result back to the client
                res.send(result);
            } catch (error) {
                console.error('Error processing payment:', error);
                res.status(500).send({ error: 'Failed to process payment' });
            }
        });
        


        // update the order status
        app.patch('/payment/:tnxID', async (req, res) => {
            const { tnxID } = req.params;
            const { status } = req.body;

            try {

                const result = await orderCollection.updateOne(
                    { tnxID: tnxID },
                    { $set: { status } }
                );

                if (result.matchedCount === 1 && result.modifiedCount === 1) {

                    res.send({
                        success: true,
                        message: 'Order status updated successfully',
                        updatedPaymentIntentId: paymentIntentId,
                        newStatus: status
                    });
                } else if (result.matchedCount === 0) {
                    res.status(404).send({
                        success: false,
                        message: 'Order not found'
                    });
                } else {
                    res.status(400).send({
                        success: false,
                        message: 'No changes made, the status may already be updated'
                    });
                }
            } catch (error) {
                console.error('Error updating order status:', error);
                res.status(500).send({
                    success: false,
                    error: error.message,
                    message: 'Internal server error'
                });
            }
        });


        //  get all orders
        app.get('/payment', async (req, res) => {
            try {
                const orders = await orderCollection.find({}).toArray();
                res.send(orders);
            } catch (error) {
                console.error('Error fetching orders:', error);
                res.status(500).send({ error: error.message });
            }
        });

        // get apecific by paymentid
        app.get('/payment/:tnxID', async (req, res) => {
            const { paymentIntentId } = req.params;

            try {
                const query = { paymentIntentId: paymentIntentId };
                const result = await orderCollection.findOne(query);

                if (result) {
                    res.send(result);
                } else {
                    res.status(404).send({ success: false, message: 'Order not found' });
                }
            } catch (error) {
                console.error('Error fetching order details:', error);
                res.status(500).send({ success: false, error: error.message, message: 'Internal server error' });
            }
        });


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Optionally close the client connection
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('SHOP.P is Running');
});

app.listen(port, () => {
    console.log(`SHOP.P is Running on Port: ${port}`);
});
