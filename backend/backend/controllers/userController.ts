import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import db from "../lib/db";
import crypto from "crypto";
import { sendMail } from "../lib/nodemailer";
import axios from "axios";
import { emailTemplate } from "../util/emailTemplate";

// @desc    Request a password reset email
// @route   POST /api/user/reset-password
// @access  Public
export const resetPasswordRequest = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).send("Missing email address");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(422).send("Invalid email format");
    }

    const doesUserExist = await db.user.findUnique({
      where: {
        email,
      },
    });

    if (!doesUserExist) {
      return res.status(404).send("Email cannot be found or signed in using a provider");
    }

    const passwordResetTokenString =
      crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    const passwordReset = await db.passwordResetToken.create({
      data: {
        token: passwordResetTokenString,
        userId: doesUserExist.id,
      },
    });

    if (!passwordReset) {
      return res.status(500).send("There is an error while handling your request");
    }

    const url = req.headers.origin;

    const passwordResetUrl = `${url}/reset-password/${passwordReset.token}`;

    await sendMail({
      subject: "Password reset request for LearnSync account",
      email: doesUserExist.email,
      html: `
      <div>
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 1rem;">Reset your LearnSync email password</h1>
        <a href=${passwordResetUrl} target="_blank" style="background-color: #0072dd; font-size: 14px; color: #ffffff; font-weight: 600; border-radius: 0.5rem; padding: 0.75rem; text-decoration: none;">
          Reset Your Password
        </a>
        <div style="margin-top: 5rem;">
          <h2 style="font-size: 14px; margin-bottom: 1rem;">If you can't see the button, Use this link instead:</h2>
          <a href=${passwordResetUrl} target="_blank" style="color: #0072dd;">${passwordResetUrl}</a>
        </div>
        <p style="margin-top: 1rem;">This link will expire in 24 hours</p>
      </div>
      `,
    });

    return res.status(200).send("Password reset link sent to email");
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send({ message: error.message });
  }
};

// @desc    Change an account password
// @route   POST /api/user/reset-password/:token
// @access  Public
export const resetAccountPassword = async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).send("Missing new password");
    }

    const token = await db.passwordResetToken.findUnique({
      where: {
        token: req.params.token,
      },
    });

    if (!token) {
      return res.status(400).send("Token expired or not valid");
    }

    if (
      (new Date().getTime() - new Date(token.createdAt).getTime()) / (1000 * 3600) >
      24
    ) {
      return res.status(400).send("Token expired or not valid");
    }

    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

    if (!passwordRegex.test(password)) {
      return res.status(422).send("Password does not meet security requirments");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await db.user.update({
      where: {
        id: token.userId,
      },
      data: {
        hashedPassword,
      },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await db.passwordResetToken.update({
      where: {
        id: token.id,
      },
      data: {
        resetAt: new Date(),
      },
    });

    return res.status(200).json(user);
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send({ message: error.message });
  }
};

// @desc    Activate an account
// @route   POST /api/activate/:token
// @access  Public
export const activateAccount = async (req: Request, res: Response) => {
  try {
    const token = await db.activateToken.findUnique({
      where: {
        token: req.params.token,
      },
    });

    if (!token) {
      return res.status(400).send("Token not valid");
    }

    const isUserVerified = await db.user.findFirst({
      where: {
        id: token.userId,
        isEmailVerified: true,
      },
    });

    if (isUserVerified) {
      return res.status(400).send("Email is already verified");
    }

    const user = await db.user.update({
      where: {
        id: token.userId,
      },
      data: {
        isEmailVerified: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json(user);
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send({ message: error.message });
  }
};

// @desc    Register or Login new user with provider
// @route   POST /api/oauth
// @access  Public
export const authorizeUserWithProvider = async (req: Request, res: Response) => {
  try {
    const { token, provider } = req.body as {
      token: string;
      provider: "google";
    };

    if (!token || !provider) {
      return res.status(400).send("Missing required fields");
    }

    if (provider.toLowerCase() == "google") {
      const userRes = await axios.get(
        `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${token}`
      );

      if (!userRes) {
        return res.status(404).send("Invalid token");
      }

      const userExists = await db.user.findFirst({
        where: {
          email: userRes.data.email,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (userExists) {
        const JWTToken = await generateToken({ id: userExists.id });

        res.setHeader("Authorization", `Bearer ${JWTToken}`);

        return res.status(200).json(userExists);
      }

      const newUser = await db.user.create({
        data: {
          avatarUrl: userRes.data.picture,
          fullName: userRes.data.name,
          email: userRes.data.email,
          provider: "GOOGLE",
          isEmailVerified: true,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!newUser) {
        return res.status(400).send("Invalid user data");
      }

      const JWTToken = await generateToken({ id: newUser.id });

      res.setHeader("Authorization", `Bearer ${JWTToken}`);

      return res.status(201).json(newUser);
    } else {
      return res.status(400).send("Invalid provider name");
    }
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send({ message: error.message });
  }
};

// @desc    Register new user
// @route   POST /api/register
// @access  Public
export const registerUser = async (req: Request, res: Response) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).send("Missing required fields");
    }

    if (fullName.length < 3 || fullName.length > 50) {
      return res.status(400).send("Full name must be between 3 and 50 characters");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(422).send("Invalid email format");
    }

    const userExists = await db.user.findFirst({
      where: {
        email,
      },
    });

    if (userExists) {
      return res.status(400).send("User already exists");
    }

    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

    if (!passwordRegex.test(password)) {
      return res.status(422).send("Password does not meet security requirments");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await db.user.create({
      data: {
        fullName: fullName.trim(),
        email,
        hashedPassword,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!newUser) {
      return res.status(400).send("Invalid user data");
    }

    const authTokenString =
      crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    const authToken = await db.activateToken.create({
      data: {
        token: authTokenString,
        userId: newUser.id,
      },
    });

    const url = req.headers.origin || "http://localhost:3000";
    const logoUrl = "https://res.cloudinary.com/dr2evgkxa/image/upload/v1748427608/logo_jr7xsc.png"; // Use the provided Cloudinary URL

    const activateUrl = `${url}/activate/${authToken.token}`;

    const year = new Date().getFullYear();
    const html = emailTemplate
      .replace("{{logoUrl}}", logoUrl)
      .replace("{{userName}}", newUser.fullName)
      .replace(/{{verifyUrl}}/g, activateUrl)
      .replace("{{year}}", year.toString());

    await sendMail({
      subject: "Verify your LearnSync account email",
      email: newUser.email,
      html,
    });

    const token = await generateToken({ id: newUser.id });

    res.setHeader("Authorization", `Bearer ${token}`);

    return res.status(201).json(newUser);
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send({ message: error.message });
  }
};

// @desc    Authenticate a user
// @route   POST /api/login
// @access  Public
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send("Missing required fields");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(422).send("Invalid email format");
    }

    const user = await db.user.findFirst({
      where: {
        email,
      },
    });

    if (!user) {
      return res.status(400).send("Incorrect email or password");
    }

    if (!user.hashedPassword) {
      return res.status(400).send("Incorrect email or password");
    }

    const passwordMatch = await bcrypt.compare(password, user.hashedPassword);

    if (!passwordMatch) {
      return res.status(400).send("Incorrect email or password");
    }

    const token = await generateToken({ id: user.id });

    res.setHeader("Authorization", `Bearer ${token}`);

    return res.status(200).json({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send({ message: error.message });
  }
};

// @desc    Get user data
// @route   GET /api/me
// @access  Private
export const getUser = async (req: Request, res: Response) => {
  try {
    const { id, avatarUrl, fullName, email, createdAt, updatedAt } = req.user;

    return res.status(200).json({
      id,
      avatarUrl,
      fullName,
      email,
      createdAt,
      updatedAt,
    });
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send({ message: error.message });
  }
};
// @desc    Edit user data
// @route   PUT /api/me
// @access  Private
export const editUser = async (req: Request, res: Response) => {
  try {
    const { fullName, avatarUrl } = req.body;

    if (!fullName || (avatarUrl != "" && avatarUrl != null && !avatarUrl)) {
      return res.status(400).send("Missing required fields");
    }

    if (fullName.length < 3 || fullName.length > 50) {
      return res.status(400).send("Full name must be between 3 and 50 characters");
    }

    let url;
    if (avatarUrl != "" && avatarUrl != null) {
      if (
        !avatarUrl.startsWith(
          `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`
        )
      ) {
        return res.status(400).send("Invalid file url");
      }

      let publicId = avatarUrl.split("/").pop().split(".")[0];

      try {
        const cloudinaryRes = await axios.get(
          `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/image/upload/${publicId}`,
          {
            auth: {
              username: process.env.CLOUDINARY_API_KEY || "",
              password: process.env.CLOUDINARY_API_SECRET || "",
            },
          }
        );

        url = cloudinaryRes.data.secure_url;
      } catch {
        return res.status(404).send("Image not found in cloudinary");
      }
    } else {
      url = avatarUrl;
    }

    const user = await db.user.update({
      where: {
        id: req.user.id,
      },
      data: {
        fullName: fullName.trim(),
        avatarUrl: url == "" ? null : url,
      },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json(user);
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send({ message: error.message });
  }
};

// @desc    Get user data
// @route   GET /api/me/:schoolId
// @access  Private
export const getSchoolUser = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(req.user);
  } catch (error: any) {
    console.log(error.message);
    return res.status(500).send({ message: error.message });
  }
};

// Generate JWT
export const generateToken = async (data: { id?: number; schoolId?: string }) => {
  return await jwt.sign(data, process.env.JWT_SECRET!, {
    expiresIn: "30d",
  });
};
