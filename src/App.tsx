import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LandingPage } from './routes/LandingPage'
import { CreateTrovePage } from './routes/CreateTrovePage'
import { PublicTrovePage } from './routes/PublicTrovePage'
import { ManagementPage } from './routes/ManagementPage'
import { TelemetryPage } from './routes/TelemetryPage'
import { NotFoundPage } from './routes/NotFoundPage'
import { RouteMetadata } from './indexing/RouteMetadata'

export function App() {
  return (
    <>
      <RouteMetadata />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="create" element={<CreateTrovePage />} />
          <Route path="c/:troveId" element={<PublicTrovePage />} />
          <Route path="m/:managementId" element={<ManagementPage />} />
          <Route path="privacy-telemetry" element={<TelemetryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  )
}
