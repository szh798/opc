function cloneItems(items = []) {
  return items.map((item) => ({
    ...item
  }));
}

Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    title: {
      type: String,
      value: ""
    },
    items: {
      type: Array,
      value: [],
      observer: "syncItems"
    }
  },

  data: {
    taskItems: []
  },

  lifetimes: {
    attached() {
      this.syncItems(this.properties.items);
    }
  },

  methods: {
    syncItems(items = []) {
      this.setData({
        taskItems: cloneItems(items)
      });
    },

    handleItemTap(event) {
      const { index } = event.currentTarget.dataset;
      const target = this.data.taskItems[index];
      if (!target) {
        return;
      }

      const nextTaskItems = cloneItems(this.data.taskItems);
      nextTaskItems[index].done = !nextTaskItems[index].done;

      this.setData({
        taskItems: nextTaskItems
      });

      const doneCount = nextTaskItems.filter((item) => item.done).length;
      this.triggerEvent("complete", {
        item: nextTaskItems[index],
        index,
        done: nextTaskItems[index].done,
        doneCount,
        total: nextTaskItems.length
      });
    }
  }
});
