import cors from 'cors';
import express from 'express';
import fs from 'fs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcrypt-nodejs';

// Defines the port the app will run on. Defaults to 8080, but can be overridden
// when starting the server. Example command to overwrite PORT env variable value:
// PORT=9000 npm start
const port = process.env.PORT || 8081;
const app = express();

const happythoughtsData = JSON.parse(fs.readFileSync('./data.json', 'utf-8'));

// Mongoose schema
const happyThoughtsSchema = new mongoose.Schema({
  message: { type: String, required: true },
  hearts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  username: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  accessToken: {
    type: String,
    default: () => crypto.randomBytes(128).toString('hex'),
  },
});

const User = mongoose.model('User', userSchema);

const authenticateUser = async (req, res, next) => {
  const user = await User.findOne({
    accessToken: req.header('Authorization'),
  });

  if (user) {
    req.user = user;
    next();
  } else {
    res.status(401).json({
      loggedOut: true,
    });
  }
};

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
  try {
    const thoughts = await HappyThoughts.find()
      .sort({ createdAt: -1 })
      .limit(20);
    if (thoughts.length > 0) {
      return res.json(thoughts);
    } else {
      res.status(404).json({ error: 'No thoughts available' });
    }
  } catch (error) {
    res.status(400).json({ error: 'Invalid request' });
  }
});

// return a random thought (has to be placed before the id route)
app.get('/thoughts/random', async (req, res) => {
  try {
    const count = await HappyThoughts.countDocuments();
    if (count === 0) {
      return res.status(404).json({ error: 'No thoughts' });
    }
    const random = Math.floor(Math.random() * count);
    const randomThought = await HappyThoughts.findOne().skip(random);

    res.json(randomThought);
  } catch (error) {
    res.status(400).json({ error: 'Invalid request' });
  }
});

//return all thoughts sorted by likes (most likes on top)(has to be placed before the id route)
app.get('/thoughts/likes', async (req, res) => {
  try {
    const sortedThoughts = await HappyThoughts.find().sort({ hearts: -1 });
    if (sortedThoughts.length > 0) {
      res.json(sortedThoughts);
    } else {
      res.status(404).json({ error: 'No thoughts' });
    }
  } catch (error) {
    res.status(400).json({ error: 'Invalid request' });
  }
});

// return a specific thought by id
app.get('/thoughts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const thought = await HappyThoughts.findById(id);
    if (thought) {
      res.json(thought);
    } else {
      res.status(404).json({ error: 'No thoughts' });
    }
  } catch (error) {
    res.status(400).json({ error: 'Invalid ID format' });
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    if (users.length > 0) {
      res.json(users);
    } else {
      res.status(404).json({ error: 'No users found' });
    }
  } catch (error) {
    res.status(400).json({ error: 'Invalid request' });
  }
});

app.post('/thoughts', async (req, res) => {
  try {
    const accessToken = req.header('Authorization');
    const user = await User.findOne({ accessToken });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { message } = req.body;

    // Basic manual validation (mongoose also validates)
    if (!message) {
      return res
        .status(400)
        .json({ error: 'Your thought is invalid, please try again.' });
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

app.delete('/thoughts/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Authenticate user
    const accessToken = req.header('Authorization');
    const user = await User.findOne({ accessToken });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Find the thought
    const thought = await HappyThoughts.findById(id);
    if (!thought) {
      return res.status(404).json({ error: 'Thought not found' });
    }

    // OPTIONAL: Check if the user owns the thought (requires a user ref in HappyThoughts)
    if (thought.user && thought.user.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden: Not your thought' });
    }

    await HappyThoughts.findByIdAndDelete(id);

    res.json({ message: 'Thought deleted', thought });
  } catch (error) {
    console.error('Error deleting thought:', error);
    res.status(400).json({ error: 'Invalid ID format or deletion error' });
  }
});

app.put('/thoughts/:id/', async (req, res) => {
  const { id } = req.params;

  try {
    // Authenticate user
    const accessToken = req.header('Authorization');
    const user = await User.findOne({ accessToken });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    } else {
      // Find the thought
      const thought = await HappyThoughts.findById(id);
      if (!thought) {
        return res.status(404).json({ error: 'Thought not found' });
      }

      // OPTIONAL: Check if the user owns the thought (requires a user ref in HappyThoughts)
      if (thought.user && thought.user.toString() !== user._id.toString()) {
        return res.status(403).json({ error: 'Forbidden: Not your thought' });
      }

      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      thought.message = message;
      await thought.save();

      res.json({ message: 'Thought updated', thought });
    }
  } catch (error) {
    console.error('Error updating thought:', error);
    res.status(400).json({ error: 'Invalid ID format or update error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    const user = await User.findOne({ username });

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      id: user._id,
      accessToken: user.accessToken,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      errors: error,
    });
  }
});

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    const existUsername = await User.findOne({ username });
    if (existUsername) {
      return res.status(400).json({
        success: false,
        message: 'Username already taken',
      });
    }

    const salt = bcrypt.genSaltSync();
    const user = new User({
      username,
      password: bcrypt.hashSync(password, salt),
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created',
      id: user._id,
      accessToken: user.accessToken,
    });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error from MongoDB
      return res.status(400).json({
        success: false,
        message: 'Username already taken',
      });
    }
    res.status(400).json({
      success: false,
      message: 'Could not create user',
      errors: error,
    });
  }
});

app.get('/secrets', authenticateUser, (req, res) => {
  res.json({ secret: 'this is a secret message.' });
});

// Start the servers
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
