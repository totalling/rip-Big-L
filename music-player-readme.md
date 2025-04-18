
## Installation

### Prerequisites

- Python 3.6 or higher
- Web browser with modern JavaScript support

### Basic Setup

1. Clone or download this repository to your local machine

2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install required packages:
   ```bash
   pip install flask werkzeug
   ```

4. For advanced features (recommended), install these additional packages:
   ```bash
   pip install mutagen pydub numpy
   ```

## Running the Application

1. Place all files in the same directory:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `app.py`

2. Run the server:
   ```bash
   python app.py
   ```

3. Open your web browser and navigate to:
   ```
   http://127.0.0.1:5000
   ```