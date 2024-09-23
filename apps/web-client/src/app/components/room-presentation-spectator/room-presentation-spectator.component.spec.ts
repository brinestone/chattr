import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomPresentationSpectatorComponent } from './room-presentation-spectator.component';

describe('RoomPresentationSpectatorComponent', () => {
  let component: RoomPresentationSpectatorComponent;
  let fixture: ComponentFixture<RoomPresentationSpectatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomPresentationSpectatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomPresentationSpectatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
