import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            BookshelfView()
                .tabItem { Label("書架", systemImage: "books.vertical.fill") }
            YearlyWrapView()
                .tabItem { Label("年度回顧", systemImage: "chart.bar.fill") }
        }
        .tint(.brown)
    }
}

#Preview {
    ContentView()
}
