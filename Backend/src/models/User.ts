import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  firebaseUid: string;
  email: string;
  displayName: string;
  initials: string;
  role: string;
  online: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    initials: {
      type: String,
      default: function (this: IUser) {
        if (!this.displayName) return "U";
        return this.displayName
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
      },
    },
    role: {
      type: String,
      default: "Team Member",
    },
    online: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>("User", UserSchema);
