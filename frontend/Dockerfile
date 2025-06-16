# Use the official Node.js Alpine image
FROM node:23-alpine

# Set the working directory
WORKDIR /app

# Copy package files to install dependencies
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the project files
COPY . .

# Build the Next.js application
RUN npm run build

# Expose the port Next.js runs on
EXPOSE 3000

# Run the Next.js application
CMD ["npm", "run", "start"]
