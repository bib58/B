import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { Webhook } from "svix";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        image_url: { type: String, required: true },
        cart: { type: mongoose.Schema.Types.Mixed, default: {} },

        ratings: [{ type: mongoose.Schema.Types.ObjectId, ref: "Rating" }],
        Address: [{ type: mongoose.Schema.Types.ObjectId, ref: "Address" }],
        store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", default: null },
        buyerOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
let connectionPromise;

const connectToDatabase = async () => {
    if (mongoose.connection.readyState === 1) {
        return;
    }

    if (!connectionPromise) {
        connectionPromise = mongoose.connect(process.env.MONGODB_URI);
    }

    await connectionPromise;
};

const readRawBody = (req) =>
    new Promise((resolve, reject) => {
        let body = "";

        req.on("data", (chunk) => {
            body += chunk;
        });

        req.on("end", () => resolve(body));
        req.on("error", reject);
    });

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).send("Method Not Allowed");
    }

    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
        return res.status(500).send("Webhook secret not configured");
    }

    const headers = {
        "svix-id": req.headers["svix-id"],
        "svix-timestamp": req.headers["svix-timestamp"],
        "svix-signature": req.headers["svix-signature"],
    };

    let evt;

    try {
        const rawBody = await readRawBody(req);
        const wh = new Webhook(WEBHOOK_SECRET);
        evt = wh.verify(rawBody, headers);
    } catch (error) {
        return res.status(400).send("Invalid signature");
    }

    if (evt.type === "user.created") {
        const user = evt.data;

        await connectToDatabase();

        await User.updateOne(
            { id: user.id },
            {
                $set: {
                    name: `${user.first_name} ${user.last_name}`,
                    email: user.email_addresses?.[0]?.email_address || "",
                    image_url: user.image_url || "",
                },
                $setOnInsert: {
                    id: user.id,
                },
            },
            { upsert: true }
        );
    }

    return res.sendStatus(200);
}
