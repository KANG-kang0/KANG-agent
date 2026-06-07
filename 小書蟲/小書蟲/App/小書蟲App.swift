import SwiftUI
import SwiftData

@main
struct 小書蟲App: App {
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            Book.self,
            BookNote.self,
        ])
        let modelConfiguration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false
        )
        do {
            return try ModelContainer(
                for: schema,
                configurations: [modelConfiguration]
            )
        } catch {
            fatalError("無法建立 ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(sharedModelContainer)
    }
}
