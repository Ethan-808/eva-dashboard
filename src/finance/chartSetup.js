import {
  Chart,
  LineElement, PointElement, LineController,
  CategoryScale, LinearScale, Filler, Tooltip, Legend,
  DoughnutController, ArcElement,
} from 'chart.js'

Chart.register(
  LineElement, PointElement, LineController,
  CategoryScale, LinearScale, Filler, Tooltip, Legend,
  DoughnutController, ArcElement,
)
