
## Design Concept Verification: "Circuit Board" Flow

This section visualizes the implemented **"Fork & Join"** (Circuit Board) pattern for the Swimlane Editor, addressing feedback on nested list layouts.

### The Problem
In complex flows (e.g., 5 layers, 3-5 scripts each), a vertical list obscures the logic. Users can't intuitively "see" that all 5 scripts in Layer 1 must finish before Layer 2 begins.

### The Solution: Visual "Gates"
We use explicit horizontal bars ("Gates") to represent the storage and synchronization points.
- **FORK Lines**: Show data splitting to multiple parallel workers.
- **JOIN Lines**: Show results merging back into a single context.
- **The "Wall"**: The Join bar acts as a visual wall, preventing the eye from jumping ahead prematurely.

#### Visualization

```mermaid
graph TD
    %% Styling
    classDef trunk stroke:#fff,stroke-width:4px,fill:none;
    classDef node fill:#1a2632,stroke:#243647,color:#fff,rx:5,ry:5,stroke-width:2px;
    classDef gate fill:#000,stroke:#fff,stroke-width:4px,color:#fff,font-weight:bold;
    classDef invisible opacity:0;
    
    linkStyle default stroke:#64748b,stroke-width:2px,fill:none;

    %% Main Input
    Start((Start)):::trunk 
    Start -->|Context| Gate1[== FORK LAYER 1 ==]:::gate

    %% Layer 1 (3 Nodes) - Validation
    subgraph Layer 1 [Layer 1: Validation & Security]
        direction TB
        Gate1 --> L1_A[Check Email Provider]:::node
        Gate1 --> L1_B[Verify IP Address]:::node
        Gate1 --> L1_C[Rate Limit Check]:::node
    end

    %% Re-converge 1
    L1_A --> Join1[== JOIN & SYNC ==]:::gate
    L1_B --> Join1
    L1_C --> Join1

    %% Transition
    Join1 -->|Merged Context| Gate2[== FORK LAYER 2 ==]:::gate

    %% Layer 2 (5 Nodes) - Enrichment
    subgraph Layer 2 [Layer 2: Data Enrichment]
        direction TB
        Gate2 --> L2_A[Fetch CRM Profile]:::node
        Gate2 --> L2_B[Geolocate User]:::node
        Gate2 --> L2_C[Fraud Score API]:::node
        Gate2 --> L2_D[Load User Roles]:::node
        Gate2 --> L2_E[Check Billing Status]:::node
    end

    %% Re-converge 2
    L2_A --> Join2[== JOIN & SYNC ==]:::gate
    L2_B --> Join2
    L2_C --> Join2
    L2_D --> Join2
    L2_E --> Join2

    Join2 --> End((End)):::trunk
```

### Key Interactions
1.  **Add Parallel**: Hover over any "FORK" line to see a `(+)` button appear directly on the wire. This creates a new branch.
2.  **Add Sequential**: Click heavily emphasized `(+)` buttons *between* the Join and Fork bars.
3.  **Reflow**: If 5 nodes are too wide, they grid wrap, but their *lines* still connect to the same central Gate, preserving the logical mental model regardless of visual position.
