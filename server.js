import cors from 'cors';
import express from 'express';
import fs from 'fs';
import mongoose from 'mongoose';

// Defines the port the app will run on. Defaults to 8080, but can be overridden
// when starting the server. Example command to overwrite PORT env variable value:
// PORT=9000 npm start
const port = process.env.PORT || 8080;
const app = express();

const happythoughtsData = JSON.parse(fs.readFileSync('./data.json', 'utf-8'));

// Mongoose schema
const happyThoughtsSchema = new mongoose.Schema({
  message: { type: String, required: true },
  hearts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Create Mongoose model
const HappyThoughts = mongoose.model('HappyThoughts', happyThoughtsSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost/happythoughts');
mongoose.Promise = Promise;

// RESET_DB logic
if (process.env.RESET_DB) {
  const seedDatabase = async () => {
    console.log('Resetting database!');
    await HappyThoughts.deleteMany();

    for (const item of happythoughtsData) {
      const newThought = new HappyThoughts(item);
      await newThought.save();
    }
  };

  seedDatabase(); // ✅ calling the async function
}

// Add middlewares to enable cors and json body parsing
app.use(cors());
app.use(express.json());

// Start defining your routes here
app.get('/', (req, res) => {
  res.send('Hello Technigo!');
});

//return all thoughts
app.get('/thoughts', async (req, res) => {
  const thoughts = await HappyThoughts.find().sort({ createdAt: -1 }).limit(20);
  res.json(thoughts);
});

// return a random thought (has to be placed before the id route)
app.get('/thoughts/random', (req, res) => {
  const randomIndex = Math.floor(Math.random() * happythoughtsData.length);
  const randomThought = happythoughtsData[randomIndex];

  res.json(randomThought);
});

//return all thoughts sorted by likes (most likes on top)(has to be placed before the id route)
app.get('/thoughts/likes', (req, res) => {
  const sortedThoughts = [...happythoughtsData].sort(
    (a, b) => b.hearts - a.hearts
  );
  res.json(sortedThoughts);
});

// return a specific thought by id
app.get('/thoughts/:id', (req, res) => {
  const { id } = req.params;

  const thought = happythoughtsData.find((thought) => thought._id === +id);

  if (thought) {
    res.json(thought);
  } else {
    res.status(404).json({ error: 'No thoughts' });
  }
});

app.post('/thoughts', async (req, res) => {
  try {
    const { message } = req.body;

    // Basic manual validation (mongoose also validates)
    if (!message) {
      return res.status(400).json({ error: 'Thought is required' });
    }

    const newThought = new HappyThoughts({
      message,
      hearts: 0,
      createdAt: new Date(),
    });
    const savedThought = await newThought.save();

    res.status(201).json(savedThought);
  } catch (error) {
    console.error('Error saving thought:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
