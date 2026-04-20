import Head from 'next/head'

export default function GlobalStyles() {
  return (
    <Head>
      <title>doddl PM</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        :root { --indigo: #3D157D; --aqua: #30BEAA; --bg: #F5F6FA; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Nunito', sans-serif; background: var(--bg); color: #172b4d; }
        input, select, textarea, button { font-family: 'Nunito', sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: #dfe1e6; border-radius: 3px; }
      `}</style>
    </Head>
  )
}
