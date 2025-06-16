import cors from 'cors';
import express from 'express';
import fs from 'fs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcrypt-nodejs';
import listEndpoints from 'express-list-endpoints';

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
  likedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
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
    required: true,
    default: () => crypto.randomBytes(128).toString('hex'),
  },
});

const User = mongoose.model('User', userSchema);

const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'No access token provided' });
  }
  // Accept either "Bearer <token>" or just "<token>"
  const accessToken = authHeader.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '')
    : authHeader;

  try {
    const user = await User.findOne({ accessToken });
    if (!user) {
      return res
        .status(401)
        .json({ message: 'You need to login or sign up to post a thought' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid access token' });
  }
};

const HappyThoughts = mongoose.model('HappyThoughts', happyThoughtsSchema);

// Connect to MongoDB
mongoose.connect(
  import.meta.env.MONGO_URL || 'mongodb://localhost/happythoughts'
);
mongoose.Promise = Promise;

// RESET_DB logic
if (import.meta.env.RESET_DB) {
  const seedDatabase = async () => {
    console.log('Resetting database!');
    await HappyThoughts.deleteMany();

    for (const item of happythoughtsData) {
      const newThought = new HappyThoughts(item);
      await newThought.save();
    }
  };

  seedDatabase();
}

// Add middlewares to enable cors and json body parsing
app.use(cors());
app.use(express.json());

// Start defining your routes here

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

// //return all thoughts sorted by likes (most likes on top)(has to be placed before the id route)
// app.get('/thoughts/likes', async (req, res) => {
//   try {
//     const sortedThoughts = await HappyThoughts.find().sort({ hearts: -1 });
//     if (sortedThoughts.length > 0) {
//       res.json(sortedThoughts);
//     } else {
//       res.status(404).json({ error: 'No thoughts' });
//     }
//   } catch (error) {
//     res.status(400).json({ error: 'Invalid request' });
//   }
// });

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

app.post('/thoughts', authenticateUser, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ error: 'Your thought is invalid, please try again.' });
    }

    const newThought = new HappyThoughts({
      message,
      hearts: 0,
      createdAt: new Date(),
      username: req.user.username,
      userId: req.user._id, // <-- use _id instead of id
    });

    const savedThought = await newThought.save();

    res.status(201).json(savedThought);
  } catch (error) {
    console.error('Error saving thought:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/thoughts/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;

  try {
    const thought = await HappyThoughts.findById(id);
    if (!thought) {
      return res.status(404).json({ error: 'Thought not found' });
    }

    // Add this log:
    console.log(
      'Thought userId:',
      thought.userId,
      'Request user id:',
      req.user._id
    );

    if (
      thought.userId &&
      thought.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Forbidden: Not your thought' });
    }

    await HappyThoughts.findByIdAndDelete(id);

    res.json({ message: 'Thought deleted', thought });
  } catch (error) {
    console.error('Error deleting thought:', error);
    res.status(400).json({ error: 'Invalid ID format or deletion error' });
  }
});

app.put('/thoughts/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  try {
    const thought = await HappyThoughts.findById(id);
    if (!thought) {
      return res.status(404).json({ error: 'Thought not found' });
    }

    // Only allow the owner to edit
    if (
      thought.userId &&
      thought.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Forbidden: Not your thought' });
    }

    if (!message || message.length < 5 || message.length > 140) {
      return res
        .status(400)
        .json({ error: 'Message must be 5-140 characters.' });
    }

    thought.message = message;
    await thought.save();

    res.json({ message: 'Thought updated', thought });
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

    // Return the user's accessToken (not a JWT)
    res.status(201).json({
      success: true,
      message: 'User created',
      id: user._id,
      accessToken: user.accessToken,
    });
  } catch (error) {
    if (error.code === 11000) {
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

app.post('/thoughts/:id/likes', authenticateUser, async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  try {
    const thought = await HappyThoughts.findById(id);
    if (!thought) {
      return res.status(404).json({ error: 'Thought not found' });
    }

    // Only add if not already liked
    if (!thought.likedBy.some((uid) => uid.equals(userId))) {
      thought.likedBy.push(userId);
      thought.hearts += 1;
      await thought.save();
    }

    res.json(thought);
  } catch (error) {
    console.error('Error liking thought:', error);
    res.status(400).json({ error: 'Invalid ID format or like error' });
  }
});

app.get('/thoughts/likes', authenticateUser, async (req, res) => {
  try {
    const likedThoughts = await HappyThoughts.find({
      likedBy: req.user._id, // <- req.user is set by authenticateUser
    });
    res.json(likedThoughts);
  } catch (error) {
    console.error('Error fetching liked thoughts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/endpoints', (req, res) => {
  res.send(listEndpoints(app));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
