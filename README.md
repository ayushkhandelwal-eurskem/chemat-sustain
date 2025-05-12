# Chematsustain 

## Prerequisites

- [Conda](https://docs.conda.io/en/latest/)
- Node.js (v18 or newer) and npm

---

## Setup Instructions

### **1. Prepare Data**

Before starting the backend, **add your required data files inside the `backend` folder**. The application expects data to be available here for proper initialization and operation.

---

### **2. Backend Setup (FastAPI)**

1. **Create and activate a Conda environment:**

```bash
cd backend
conda create -n venv python=3.10
conda activate venv
```

2. **Install dependencies:**

```bash
pip install -r requirements.txt
```

3. **Run the FastAPI server:**

```bash
fastapi dev app.py
```

    - The API will be available at [http://localhost:8000](http://localhost:8000).

---

### **3. Frontend Setup (Next.js + TypeScript)**

1. **Navigate to the frontend folder:**

```bash
cd frontend
```

2. **Install dependencies:**

```bash
npm install
```

3. **Run the development server:**

```bash
npm run dev
```

    - The frontend will be accessible at [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
project-root/
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── data [your data files here]
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    └── ...
```

## Notes

- **Always add or update your data inside the `backend` folder before starting the backend server.**
- The backend and frontend run independently; you can develop both simultaneously.
- For production deployment, consult the documentation for FastAPI and Next.js best practices.
