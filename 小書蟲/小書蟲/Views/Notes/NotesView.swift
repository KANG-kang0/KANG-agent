import SwiftUI
import SwiftData
import PhotosUI

struct NotesView: View {
    @Bindable var book: Book
    @Environment(\.modelContext) private var modelContext

    @State private var photoPickerItems: [PhotosPickerItem] = []
    @State private var selectedNote: BookNote?
    @State private var showCamera = false

    private let columns = [GridItem(.adaptive(minimum: 80), spacing: 8)]

    private var sortedNotes: [BookNote] {
        book.notes.sorted { $0.dateAdded < $1.dateAdded }
    }

    private var remaining: Int { max(0, 10 - book.notes.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(sortedNotes) { note in
                    if let uiImage = UIImage(data: note.imageData) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 80, height: 80)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .onTapGesture { selectedNote = note }
                    }
                }

                if remaining > 0 {
                    Menu {
                        Button {
                            showCamera = true
                        } label: {
                            Label("拍照", systemImage: "camera")
                        }
                        PhotosPicker(
                            selection: $photoPickerItems,
                            maxSelectionCount: remaining,
                            matching: .images
                        ) {
                            Label("從相簿選", systemImage: "photo.on.rectangle")
                        }
                    } label: {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color.brown.opacity(0.1))
                            .frame(width: 80, height: 80)
                            .overlay(
                                Image(systemName: "plus")
                                    .font(.title2)
                                    .foregroundStyle(.brown)
                            )
                    }
                }
            }

            HStack {
                Text("\(book.notes.count) / 10")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("最多 10 張，強迫精選")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                Spacer()
            }
        }
        .onChange(of: photoPickerItems) { _, items in
            guard !items.isEmpty else { return }
            Task { await loadImages(items) }
        }
        .sheet(item: $selectedNote) { note in
            NoteDetailSheet(note: note) {
                modelContext.delete(note)
                selectedNote = nil
            }
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { data in
                let note = BookNote(imageData: data, book: book)
                modelContext.insert(note)
            }
            .ignoresSafeArea()
        }
    }

    private func loadImages(_ items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self) {
                let note = BookNote(imageData: data, book: book)
                modelContext.insert(note)
            }
        }
        photoPickerItems = []
    }
}

// MARK: - 單張筆記預覽

struct NoteDetailSheet: View {
    let note: BookNote
    let onDelete: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirm = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if let uiImage = UIImage(data: note.imageData) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFit()
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("關閉") { dismiss() }
                        .tint(.white)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Image(systemName: "trash")
                    }
                    .tint(.white)
                }
            }
            .toolbarBackground(.black, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .confirmationDialog("刪除這張筆記？", isPresented: $showDeleteConfirm) {
                Button("刪除", role: .destructive, action: onDelete)
                Button("取消", role: .cancel) {}
            }
        }
    }
}
