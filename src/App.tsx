import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './App.css'
const BASE_URL = import.meta.env.VITE_API_URL as string;

interface Connection {
  application: string
  name: string
  authorization_status: string
}

interface Job {
  status: string
  is_error: string
  completed_at: string
  started_at: string
  recipe_id: string
}

interface Project {
  name: string
  id: string
  folder_id: string
}

interface Folder {
  id: number
  name: string
  parent_id: number | null
  project_id: number
  is_project: boolean
  created_at: string
  updated_at: string
}

interface Recipe {
  id: number
  name: string
  running: boolean
  job_succeeded_count: number
  job_failed_count: number
  project_id: number
  folder_id: number
}


function App() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRecipe, setSelectedRecipe] = useState<string>('all')
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
const [selectedNode, setSelectedNode] = useState<{
  type: "project" | "folder"
  id: number
} | null>(null)
const [lastSynced, setLastSynced] = useState<string | null>(null);
const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());
const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())
const [folderSearch, setFolderSearch] = useState("")

const fetchData = async () => {
  try {
    setLoading(true);

    const [projectsRes, connectionsRes, jobsRes, recipesRes, foldersRes] =
  await Promise.all([
    fetch(`${BASE_URL}/api/projects`),
    fetch(`${BASE_URL}/api/connections`),
    fetch(`${BASE_URL}/api/jobs`),
    fetch(`${BASE_URL}/api/recipes`),
    fetch(`${BASE_URL}/api/folders`)
  ]);

    setProjects(await projectsRes.json());
    setConnections(await connectionsRes.json());
    setJobs(await jobsRes.json());
    setRecipes(await recipesRes.json());
    setFolders(await foldersRes.json());

    setLastSynced(new Date().toLocaleString()); // 👈 update time
  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    setLoading(false);
  }
};
  
useEffect(() => {
  fetchData();
}, []);

  const connectionStats = {
    total: connections.length,
    active: connections.filter(c => c.authorization_status === 'success').length,
    failed: connections.filter(c => c.authorization_status !== 'success' && c.authorization_status).length
  }

  const filteredJobs = jobs.filter(job => {
    let match = true
    if (selectedRecipe !== 'all' && job.recipe_id !== selectedRecipe) match = false
    if (startDate && job.completed_at && new Date(job.completed_at) < new Date(startDate)) match = false
    if (endDate && job.completed_at && new Date(job.completed_at) > new Date(endDate)) match = false
    return match
  })

  const filteredRecipes = recipes.filter(recipe => {
  if (selectedProject !== 'all' && recipe.project_id !== Number(selectedProject)) 
    return false
  return true
})

  const jobStats = {
    total: filteredJobs.length,
    succeeded: filteredJobs.filter(j => j.status === 'succeeded').length,
    failed: filteredJobs.filter(j => j.status === 'failed').length
  }

  const filteredRecipesByNode = recipes.filter(r => {
  if (!selectedNode) return false

  if (selectedNode.type === "project") {
    return r.project_id === selectedNode.id
  }

  if (selectedNode.type === "folder") {
    return r.folder_id === selectedNode.id
  }

  return false
})
  
  const connectionByApp = connections.reduce((acc, conn) => {
    if (!acc[conn.application]) acc[conn.application] = []
    acc[conn.application].push(conn)
    return acc
  }, {} as Record<string, Connection[]>)

  const toggleApp = (app: string) => {
    setExpandedApps(prev => {
      const next = new Set(prev)
      if (next.has(app)) next.delete(app)
      else next.add(app)
      return next
    })
  }
const toggleProject = (id: number) => {
  setExpandedProjects(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

const toggleFolder = (id: number) => {
  setExpandedFolders(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}
  

 const projectFolders = folders.filter(f => {
  if (!folderSearch) return f.is_project

  return (
    f.is_project &&
    f.name.toLowerCase().includes(folderSearch.toLowerCase())
  )
})


  const recipeStats = filteredRecipes.map(r => ({
  name: r.name.length > 20 ? r.name.substring(0, 20) + '...' : r.name,
  succeeded: r.job_succeeded_count || 0,
  failed: r.job_failed_count || 0
})).slice(0, 5)

  const jobsByDate = filteredJobs.reduce((acc, job) => {
    if (job.completed_at) {
      const date = new Date(job.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (!acc[date]) acc[date] = { date, succeeded: 0, failed: 0 }
      if (job.status === 'succeeded') acc[date].succeeded++
      else if (job.status === 'failed') acc[date].failed++
    }
    return acc
  }, {} as Record<string, { date: string; succeeded: number; failed: number }>)

  const dailyJobData = Object.values(jobsByDate).slice(-7)

const renderFolders = (parentId: number, level = 1): JSX.Element[] => {

  const children = folders.filter(f => f.parent_id === parentId)

  return children.map(folder => {

    const isExpanded = expandedFolders.has(folder.id)

    return (
      <div key={folder.id}>

        <div
          className="connection-item"
          style={{
            paddingLeft: `${level * 18}px`,
            cursor: "pointer"
          }}
          onClick={() => {
            toggleFolder(folder.id)

            setSelectedNode({
              type: "folder",
              id: folder.id
            })
          }}
        >
          {isExpanded ? "▼" : "▶"} 📂 {folder.name}
        </div>

        {isExpanded && renderFolders(folder.id, level + 1)}

      </div>
    )
  })
}

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading Dashboard...</p>
      </div>
    )
  }

  return (
    
    <div className="dashboard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
  <button onClick={fetchData} style={{
    padding: "8px 16px",
    cursor: "pointer",
    backgroundColor: "#1976d2",
    color: "white",
    border: "none",
    borderRadius: "4px"
  }}>
    🔄 Refresh
  </button>

  <div style={{ fontSize: "14px", color: "gray" }}>
    {lastSynced ? `Last synced: ${lastSynced}` : "Not synced yet"}
  </div>
</div>
      <header className="header">
        <h1>Workato Observability & Performance Analytics</h1>
        <p>Track automation performance</p>
      </header>

      <div className="filters">

  {/* SEARCH */}
  <div className="filter-group">
    <label>Search:</label>
    <input
      type="text"
      placeholder="Search project or folder..."
      value={folderSearch}
      onChange={(e) => setFolderSearch(e.target.value)}
    />
  </div>

  {/* PROJECT + FOLDER TREE */}
  <div className="filter-group" style={{ minWidth: "260px" }}>
    <label>Projects / Folders:</label>

    <div className="folder-tree">

      {projectFolders
        .filter(p =>
          !folderSearch ||
          p.name.toLowerCase().includes(folderSearch.toLowerCase())
        )
        .map(project => {

          const isExpanded = expandedProjects.has(project.id)

          return (
            <div key={project.id}>

              <div
                className="connection-item"
                style={{ cursor: "pointer", fontWeight: "bold" }}
                onClick={() => {

                  toggleProject(project.id)

                  setSelectedNode({
                    type: "project",
                    id: project.id
                  })

                }}
              >
                {isExpanded ? "▼" : "▶"} 📁 {project.name}
              </div>

              {isExpanded && renderFolders(project.id)}

            </div>
          )

        })}

    </div>
  </div>

  {/* RECIPE FILTER */}
  <div className="filter-group">
    <label>Recipe:</label>

    <select
      value={selectedRecipe}
      onChange={(e) => setSelectedRecipe(e.target.value)}
    >

      <option value="all">All Recipes</option>

      {filteredRecipesByNode.map(recipe => (
        <option key={recipe.id} value={recipe.id}>
          {recipe.name}
        </option>
      ))}

    </select>
  </div>

  {/* START DATE */}
  <div className="filter-group">
    <label>Start Date:</label>
    <input
      type="date"
      value={startDate}
      onChange={(e) => setStartDate(e.target.value)}
    />
  </div>

  {/* END DATE */}
  <div className="filter-group">
    <label>End Date:</label>
    <input
      type="date"
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
    />
  </div>

  {/* RESET */}
  <button
    className="reset-btn"
    onClick={() => {
      setSelectedRecipe("all")
      setSelectedNode(null)
      setStartDate("")
      setEndDate("")
    }}
  >
    Reset Filters
  </button>

</div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-content">
            <h3>Connections</h3>
            <div className="stat-number">{connectionStats.total}</div>
            <div className="stat-detail">
              <span className="success">{connectionStats.active} Active</span>
              <span className="error">{connectionStats.failed} Failed</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-content">
            <h3>Jobs</h3>
            <div className="stat-number">{jobStats.total}</div>
            <div className="stat-detail">
              <span className="success">{jobStats.succeeded} Success</span>
              <span className="error">{jobStats.failed} Failed</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-content">
            <h3>Projects</h3>
            <div className="stat-number">{projects.length}</div>
            <div className="stat-detail">Active Projects</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-content">
            <h3>Recipes</h3>
            <div className="stat-number">{recipes.length}</div>
            <div className="stat-detail">
              <span className="success">{recipes.filter(r => r.running === true).length} Running</span>
            </div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Connections by Application</h3>
          <div className="connections-menu">
            {Object.entries(connectionByApp).map(([app, conns]) => (
              <div key={app} className="app-group">
                <div className="app-header" onClick={() => toggleApp(app)}>
                  <span className="app-toggle">{expandedApps.has(app) ? '▼' : '▶'}</span>
                  <span className="app-name">{app}</span>
                  <span className="app-count">{conns.length}</span>
                </div>
                {expandedApps.has(app) && (
                  <div className="connections-list">
                    {conns.map((conn, idx) => (
                      <div key={idx} className="connection-item">
                        <span className="connection-name">{conn.name}</span>
                        <span className={`connection-status ${conn.authorization_status === 'success' ? 'status-success' : 'status-failed'}`}>
                          {conn.authorization_status === 'success' ? '✓' : '✗'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <h3>Job Status Overview</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyJobData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="succeeded" stackId="a" fill="#43e97b" name="Succeeded" />
              <Bar dataKey="failed" stackId="a" fill="#fa709a" name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card full-width">
          <h3>Top 5 Recipes Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={recipeStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="succeeded" fill="#43e97b" name="Succeeded" />
              <Bar dataKey="failed" fill="#fa709a" name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default App
